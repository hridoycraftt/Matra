import { ApiError, GoogleGenAI } from "@google/genai";
import { MatraAIError, type Backend, type WebSource } from "./types";

let cached: { key: string; client: GoogleGenAI } | null = null;
function client(apiKey: string): GoogleGenAI {
  // v1beta: the "-latest" aliases and newest models are served there, not on v1.
  if (cached?.key !== apiKey) cached = { key: apiKey, client: new GoogleGenAI({ apiKey, apiVersion: "v1beta" }) };
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
      return new MatraAIError("No Gemini model is available for this key. Check the key in Google AI Studio.", "other");
    if (err.status === 429)
      return new MatraAIError("Gemini's free-tier limit was reached. Wait a minute, or pick a Flash-Lite model in Settings.", "rate");
    return new MatraAIError(`AI service error (${err.status}). Try again.`, "other");
  }
  if (err instanceof TypeError)
    return new MatraAIError("Can't reach Google Gemini. Check your internet connection, then try again.", "network");
  return new MatraAIError(err instanceof Error ? err.message : "Something went wrong.", "other");
}

/** Models this key could not use, mapped to the model Matra switched to. */
const replaced = new Map<string, string>();

/** Pick the best text model this key can use: newest plain Flash, then any Flash, then anything. */
export function pickBestModel(ids: string[]): string | null {
  const version = (id: string) => parseFloat(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  const byNewest = (a: string, b: string) => version(b) - version(a);
  const plainFlash = ids.filter((id) => /^gemini-[\d.]+-flash$/.test(id)).sort(byNewest);
  const anyFlash = ids.filter((id) => id.includes("flash") && !/preview|exp|lite/.test(id)).sort(byNewest);
  return plainFlash[0] ?? anyFlash[0] ?? ids.find((id) => id.includes("flash")) ?? ids[0] ?? null;
}

/** Remember the switch so Settings shows the model that actually works. */
function persistModel(model: string) {
  try {
    const key = "matra.settings.v1";
    const s = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...s, googleModel: model }));
  } catch {
    /* ignore */
  }
}

function isModelMissing(err: unknown) {
  return err instanceof ApiError && (err.status === 404 || (err.status === 400 && /model/i.test(err.message) && /not (found|supported)/i.test(err.message)));
}

export function googleBackend(apiKey: string, requested: string): Backend {
  const ai = client(apiKey);
  let model = replaced.get(requested) ?? requested;

  /** Run a request; if the model doesn't exist for this key, switch to one that does and retry once. */
  async function withModel<T>(run: (m: string) => Promise<T>): Promise<T> {
    try {
      return await run(model);
    } catch (err) {
      if (!isModelMissing(err)) throw err;
      const ids = (await listGoogleModels(apiKey).catch(() => [])).map((m) => m.id);
      const pick = pickBestModel(ids.filter((id) => id !== model));
      if (!pick) throw err;
      replaced.set(requested, pick);
      persistModel(pick);
      model = pick;
      return run(model);
    }
  }

  return {
    async json({ system, user, schema, signal }) {
      try {
        const res = await withModel((m) =>
          ai.models.generateContent({
            model: m,
            contents: user,
            config: {
              systemInstruction: system,
              responseMimeType: "application/json",
              responseJsonSchema: schema,
              abortSignal: signal,
            },
          }),
        );
        if (!res.text) throw new MatraAIError("The AI returned no result. Try again.", "other");
        return res.text;
      } catch (err) {
        if (signal?.aborted) throw err;
        throw friendly(err);
      }
    },
    async search({ system, user, signal }) {
      try {
        // Grounding with Google Search: Gemini searches, answers, and lists the pages it used.
        const res = await withModel((m) =>
          ai.models.generateContent({
            model: m,
            contents: user,
            config: { systemInstruction: system, tools: [{ googleSearch: {} }], abortSignal: signal },
          }),
        );
        const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources: WebSource[] = chunks
          .map((c) => ({ title: c.web?.title ?? c.web?.uri ?? "", url: c.web?.uri ?? "" }))
          .filter((s) => s.url);
        return { text: res.text ?? "", sources };
      } catch (err) {
        if (signal?.aborted) throw err;
        throw friendly(err);
      }
    },
    async stream({ system, user, signal }, onText) {
      let soFar = "";
      try {
        const stream = await withModel((m) =>
          ai.models.generateContentStream({
            model: m,
            contents: user,
            config: { systemInstruction: system, abortSignal: signal },
          }),
        );
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
