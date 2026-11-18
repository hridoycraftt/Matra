import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import type { BetaFallbacksParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { CheckResult, Goals, RewriteMode, Settings } from "./types";

/** Longest text sent in one check. Longer documents are checked in part, and the UI says so. */
export const MAX_CHECK_CHARS = 20000;

export class MatraAIError extends Error {
  constructor(message: string, readonly kind: "no_key" | "auth" | "rate" | "network" | "refusal" | "other") {
    super(message);
  }
}

let cached: { key: string; client: Anthropic } | null = null;
function client(apiKey: string | null): Anthropic {
  if (!apiKey) throw new MatraAIError("Add your Anthropic API key in Settings to start checking.", "no_key");
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

export function friendlyError(err: unknown): MatraAIError {
  if (err instanceof MatraAIError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new MatraAIError("Your API key was not accepted. Check it in Settings.", "auth");
  if (err instanceof Anthropic.RateLimitError)
    return new MatraAIError("Too many requests right now. Matra will try again shortly.", "rate");
  if (err instanceof Anthropic.APIConnectionError)
    return new MatraAIError("Can't reach the AI service. Check your internet connection.", "network");
  if (err instanceof Anthropic.APIError) return new MatraAIError(`AI service error (${err.status}). Try again.`, "other");
  return new MatraAIError(err instanceof Error ? err.message : "Something went wrong.", "other");
}

const GOAL_TEXT: Record<keyof Goals, Record<string, string>> = {
  audience: { general: "a general audience", knowledgeable: "a knowledgeable audience", expert: "expert readers" },
  formality: { informal: "informal", neutral: "neutral", formal: "formal" },
  domain: {
    general: "general writing",
    academic: "academic writing",
    business: "business writing",
    email: "an email",
    creative: "creative writing",
    social: "a social media post",
  },
  intent: { inform: "inform", convince: "convince", describe: "describe", tell_story: "tell a story" },
};

const CHECK_SYSTEM = `You are Matra, a meticulous writing editor for English, Bangla (বাংলা), and mixed English–Bangla text.

Find real problems in the user's text and propose precise fixes. Categories:
- correctness: spelling, grammar, punctuation, agreement, wrong word (their/there), Bangla বানান per Bangla Academy standard spelling, sadhu–cholito mixing (e.g. "করিব" in cholito text should be "করব").
- clarity: wordy, unclear, or overly long phrasing; passive voice where active is clearer.
- engagement: weak, vague, or repeated words; suggest a livelier precise word.
- delivery: tone, formality, politeness, confidence, or words that do not fit the user's goals.

Rules for each issue:
- "original" must be copied EXACTLY from the text (same characters, same case, same spacing) and be as short as possible: the word or phrase that changes, not the whole sentence, unless the whole sentence is rewritten for clarity.
- "prefix" is the 1–30 characters that appear immediately before "original" in the text (copy exactly; empty string if original starts the text). It disambiguates repeated words.
- "replacement" is the corrected text for exactly that span.
- "title" is a 1–4 word label (e.g. "Spelling", "Subject–verb agreement", "বানান", "Wordy phrase").
- "explanation" is one short sentence explaining why.
- Romanized Bangla (Banglish, e.g. "ami kal jabo") is not an error by itself; only flag it under delivery when the goals are formal, suggesting Bangla script.
- Do not flag names, code, URLs, or deliberate style. Do not invent problems. If the text is fine, return no issues.

Also report:
- "language": en, bn, mixed, or banglish.
- "score": 0–100 overall writing quality for the stated goals (100 = nothing to improve).
- "tone_labels": up to 3 single words for how the text sounds (e.g. friendly, confident, formal, worried, direct).
- "tone_summary": one short sentence on how a reader will perceive the tone.`;

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["language", "score", "tone_labels", "tone_summary", "issues"],
  properties: {
    language: { type: "string", enum: ["en", "bn", "mixed", "banglish"] },
    score: { type: "integer" },
    tone_labels: { type: "array", items: { type: "string" } },
    tone_summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "original", "replacement", "prefix", "title", "explanation"],
        properties: {
          category: { type: "string", enum: ["correctness", "clarity", "engagement", "delivery"] },
          original: { type: "string" },
          replacement: { type: "string" },
          prefix: { type: "string" },
          title: { type: "string" },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

function explanationLine(settings: Settings) {
  if (settings.explanationLanguage === "en") return "Write titles and explanations in English.";
  if (settings.explanationLanguage === "bn") return "Write titles and explanations in Bangla.";
  return "Write titles and explanations in the main language of the text.";
}

export async function checkText(
  apiKey: string | null,
  text: string,
  goals: Goals,
  settings: Settings,
  signal?: AbortSignal,
): Promise<CheckResult> {
  const c = client(apiKey);
  const body = text.slice(0, MAX_CHECK_CHARS);
  const context = [
    `Goals: written for ${GOAL_TEXT.audience[goals.audience]}, ${GOAL_TEXT.formality[goals.formality]} formality, as ${GOAL_TEXT.domain[goals.domain]}, meant to ${GOAL_TEXT.intent[goals.intent]}.`,
    `English spelling: ${settings.englishDialect === "UK" ? "British" : "American"}. Bangla: standard cholito (প্রমিত চলিত).`,
    explanationLine(settings),
  ].join("\n");

  try {
    const response = await c.beta.messages.create(
      {
        model: settings.model,
        max_tokens: 16000,
        ...fallbackParams(settings.model),
        system: CHECK_SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: CHECK_SCHEMA } },
        messages: [{ role: "user", content: `${context}\n\n<text>\n${body}\n</text>` }],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") {
      throw new MatraAIError("The AI declined to check this text.", "refusal");
    }
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new MatraAIError("The AI returned no result. Try again.", "other");
    const parsed = JSON.parse(textBlock.text) as CheckResult;
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    parsed.tone_labels = parsed.tone_labels.slice(0, 3);
    return parsed;
  } catch (err) {
    if (signal?.aborted) throw err;
    throw friendlyError(err);
  }
}

const REWRITE_INSTRUCTIONS: Record<Exclude<RewriteMode, "custom">, string> = {
  improve: "Improve this text: fix every error and make it clearer and more polished, keeping the meaning, language, and length roughly the same.",
  shorten: "Make this text noticeably shorter and tighter while keeping every key point.",
  expand: "Expand this text with helpful detail and smoother flow, keeping the same voice.",
  simplify: "Rewrite this text in plain, simple words that anyone can follow.",
  formal: "Rewrite this text in a more formal, professional tone.",
  friendly: "Rewrite this text in a warmer, friendlier tone.",
  confident: "Rewrite this text so it sounds more confident and direct: remove hedging and filler.",
  to_bangla: "Translate this text into natural, fluent standard Bangla (প্রমিত চলিত) in Bangla script. Keep names and technical terms readable.",
  to_english: "Translate this text into natural, fluent English.",
  banglish_to_bangla:
    "This text is Bangla written in Latin letters (Banglish), possibly mixed with English. Convert it to correct standard Bangla in Bangla script (প্রমিত চলিত), fixing spelling. Keep English technical words that Bangla speakers normally write in English.",
};

const WRITER_SYSTEM = `You are Matra, a writing partner for English and Bangla. Output only the requested text itself: no preamble, no quotes around it, no notes or explanations after it. Keep the original's line breaks and paragraphing unless asked otherwise. Never use Markdown formatting unless the input uses it.`;

/** Streams rewritten text. Calls onText with the full text so far. */
export async function streamRewrite(
  apiKey: string | null,
  opts: { text: string; mode: RewriteMode; custom?: string; goals: Goals; settings: Settings },
  onText: (soFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const instruction = opts.mode === "custom" ? (opts.custom ?? "").trim() : REWRITE_INSTRUCTIONS[opts.mode];
  const goals = `The writer's goals: ${GOAL_TEXT.formality[opts.goals.formality]} formality, ${GOAL_TEXT.domain[opts.goals.domain]}, for ${GOAL_TEXT.audience[opts.goals.audience]}.`;
  return streamText(
    apiKey,
    opts.settings.model,
    `${instruction}\n${goals}\n\n<text>\n${opts.text}\n</text>`,
    onText,
    signal,
  );
}

/** Streams new writing from a prompt, optionally grounded in the current document. */
export async function streamCompose(
  apiKey: string | null,
  opts: { prompt: string; context: string; goals: Goals; settings: Settings },
  onText: (soFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const ctx = opts.context.trim()
    ? `\n\nThe document the user is working on (for context; do not repeat it):\n<document>\n${opts.context.slice(0, MAX_CHECK_CHARS)}\n</document>`
    : "";
  const goals = `Write for ${GOAL_TEXT.audience[opts.goals.audience]}, ${GOAL_TEXT.formality[opts.goals.formality]} formality, as ${GOAL_TEXT.domain[opts.goals.domain]}. Answer in the language the request is written in unless it asks for another.`;
  return streamText(apiKey, opts.settings.model, `${opts.prompt.trim()}\n\n${goals}${ctx}`, onText, signal);
}

async function streamText(
  apiKey: string | null,
  model: string,
  userContent: string,
  onText: (soFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const c = client(apiKey);
  let soFar = "";
  try {
    const stream = c.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        ...fallbackParams(model),
        system: WRITER_SYSTEM,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: userContent }],
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
    throw friendlyError(err);
  }
}
