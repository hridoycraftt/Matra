import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import type { BetaFallbacksParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { MatraAIError, type Backend } from "./types";

let cached: { key: string; client: Anthropic } | null = null;
function client(apiKey: string): Anthropic {
  if (cached?.key !== apiKey) {
    // Matra is a desktop app on the user's own Mac with the user's own key,
    // so calling the API straight from the app's webview is intended here.
    cached = { key: apiKey, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 }) };
  }
  return cached.client;
}

/** Server-side refusal fallback, for the models that accept it. */
function fallbackParams(model: string): { betas?: AnthropicBeta[]; fallbacks?: BetaFallbacksParam } {
  if (model === "claude-opus-5-5" || model === "claude-sonnet-5-5") {
    return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  }
  return {};
}

function friendly(err: unknown): MatraAIError {
  if (err instanceof MatraAIError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new MatraAIError("Your Anthropic API key was not accepted. Check it in Settings.", "auth");
  if (err instanceof Anthropic.RateLimitError)
    return new MatraAIError("Too many requests right now. Try again in a moment.", "rate");
  if (err instanceof Anthropic.APIConnectionError)
    return new MatraAIError("Can't reach the AI service. Check your internet connection.", "network");
  if (err instanceof Anthropic.APIError) return new MatraAIError(`AI service error (${err.status}). Try again.`, "other");
  return new MatraAIError(err instanceof Error ? err.message : "Something went wrong.", "other");
}

export function anthropicBackend(apiKey: string, model: string): Backend {
  const c = client(apiKey);
  return {
    async json({ system, user, schema, signal }) {
      try {
        const response = await c.beta.messages.create(
          {
            model,
            max_tokens: 16000,
            ...fallbackParams(model),
            system,
            output_config: { effort: "low", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
            messages: [{ role: "user", content: user }],
          },
          { signal },
        );
        if (response.stop_reason === "refusal") throw new MatraAIError("The AI declined this request.", "refusal");
        const block = response.content.find((b) => b.type === "text");
        if (!block || block.type !== "text") throw new MatraAIError("The AI returned no result. Try again.", "other");
        return block.text;
      } catch (err) {
        if (signal?.aborted) throw err;
        throw friendly(err);
      }
    },
    async stream({ system, user, signal }, onText) {
      let soFar = "";
      try {
        const stream = c.beta.messages.stream(
          {
            model,
            max_tokens: 64000,
            ...fallbackParams(model),
            system,
            output_config: { effort: "low" },
            messages: [{ role: "user", content: user }],
          },
          { signal },
        );
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            soFar += event.delta.text;
            onText(soFar);
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") throw new MatraAIError("The AI declined this request.", "refusal");
        return soFar.trim();
      } catch (err) {
        if (signal?.aborted) throw err;
        throw friendly(err);
      }
    },
  };
}
