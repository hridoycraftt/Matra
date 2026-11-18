import { ApiError, GoogleGenAI } from "@google/genai";
import { MatraAIError, type Backend } from "./types";

let cached: { key: string; client: GoogleGenAI } | null = null;
function client(apiKey: string): GoogleGenAI {
  if (cached?.key !== apiKey) cached = { key: apiKey, client: new GoogleGenAI({ apiKey }) };
  return cached.client;
}

function friendly(err: unknown): MatraAIError {
  if (err instanceof MatraAIError) return err;
  if (err instanceof ApiError) {
    if (err.status === 400 && /api key/i.test(err.message))
      return new MatraAIError("Your Google API key was not accepted. Check it in Settings.", "auth");
    if (err.status === 401 || err.status === 403)
      return new MatraAIError("Your Google API key was not accepted. Check it in Settings.", "auth");
    if (err.status === 404)
      return new MatraAIError("This Gemini model isn't available for your key. Pick another model in Settings.", "other");
    if (err.status === 429)
      return new MatraAIError("Gemini's free-tier limit was reached. Wait a minute, or pick a Flash-Lite model in Settings.", "rate");
    return new MatraAIError(`AI service error (${err.status}). Try again.`, "other");
  }
  if (err instanceof TypeError)
    return new MatraAIError("Can't reach Google Gemini. Check your internet connection, then try again.", "network");
  return new MatraAIError(err instanceof Error ? err.message : "Something went wrong.", "other");
}

export function googleBackend(apiKey: string, model: string): Backend {
  const ai = client(apiKey);
  return {
    async json({ system, user, schema, signal }) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            abortSignal: signal,
          },
        });
        if (!res.text) throw new MatraAIError("The AI returned no result. Try again.", "other");
        return res.text;
      } catch (err) {
        if (signal?.aborted) throw err;
        throw friendly(err);
      }
    },
    async stream({ system, user, signal }, onText) {
      let soFar = "";
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: user,
          config: { systemInstruction: system, abortSignal: signal },
        });
        for await (const chunk of stream) {
          if (chunk.text) {
            soFar += chunk.text;
            onText(soFar);
          }
        }
        return soFar.trim();
      } catch (err) {
        if (signal?.aborted) throw err;
        throw friendly(err);
      }
    },
  };
}

/** Gemini models this key can use for text generation, newest-looking first. */
export async function listGoogleModels(apiKey: string): Promise<{ id: string; label: string }[]> {
  const pager = await client(apiKey).models.list();
  const out: { id: string; label: string }[] = [];
  for await (const m of pager) {
    const id = (m.name ?? "").replace(/^models\//, "");
    if (!id.startsWith("gemini") || !m.supportedActions?.includes("generateContent")) continue;
    if (/image|tts|audio|live|embedding|robotics|computer/i.test(id)) continue;
    out.push({ id, label: m.displayName ?? id });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}
