import { runJson, runSearch } from "./ai";
import type { Goals, Settings } from "./types";

export interface ReaderReaction {
  overall: string;
  feels: string[];
  questions: string[];
  improvements: { quote: string; suggestion: string }[];
}

export interface GradeResult {
  grade: string;
  score: number;
  strengths: string[];
  improvements: string[];
}

export interface AIEstimate {
  percent: number;
  verdict: string;
  passages: { quote: string; reason: string }[];
}

const S = (props: Record<string, unknown>, required = Object.keys(props)) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties: props,
});
const str = { type: "string" };
const strs = { type: "array", items: str };

const READER_SCHEMA = S({
  overall: str,
  feels: strs,
  questions: strs,
  improvements: { type: "array", items: S({ quote: str, suggestion: str }) },
});
const GRADE_SCHEMA = S({ grade: str, score: { type: "integer" }, strengths: strs, improvements: strs });
const AI_SCHEMA = S({
  percent: { type: "integer" },
  verdict: str,
  passages: { type: "array", items: S({ quote: str, reason: str }) },
});

const LANG = "Answer in the language the text is mostly written in.";

/** How a specific reader is likely to receive the text, and what they'll ask. */
export function readerReactions(apiKey: string | null, text: string, reader: string, goals: Goals, settings: Settings, signal?: AbortSignal) {
  return runJson<ReaderReaction>(apiKey, settings, {
    system: `You are Matra's Reader Reactions agent. Read the text as the given reader would and report honestly how it lands. ${LANG}`,
    user: `Reader: ${reader}\nThe writer wants to ${goals.intent.replace("_", " ")} and writes ${goals.formality}.\n\nGive: "overall" (one or two sentences on how this reader will react), "feels" (up to 3 single words for what the reader will feel), "questions" (up to 3 questions this reader will likely ask after reading), "improvements" (up to 3 items: an exact short quote from the text and a concrete rewrite suggestion aimed at this reader).\n\n<text>\n${text}\n</text>`,
    schema: READER_SCHEMA,
    signal,
  });
}

/** Grade the text against a rubric or assignment brief. */
export function gradeText(apiKey: string | null, text: string, rubric: string, settings: Settings, signal?: AbortSignal) {
  return runJson<GradeResult>(apiKey, settings, {
    system: `You are Matra's AI Grader: a fair, specific teacher. Grade only against the rubric given; if no rubric is given, grade clarity, structure, evidence and correctness. ${LANG}`,
    user: `Rubric or assignment brief:\n${rubric.trim() || "(none given)"}\n\nGive: "grade" (a letter grade like A, B+, C), "score" (0-100), "strengths" (up to 3), "improvements" (up to 4, each specific and actionable).\n\n<text>\n${text}\n</text>`,
    schema: GRADE_SCHEMA,
    signal,
  });
}

/** A rough estimate of how much of the text reads as AI-generated. */
export function estimateAI(apiKey: string | null, text: string, settings: Settings, signal?: AbortSignal) {
  return runJson<AIEstimate>(apiKey, settings, {
    system: `You estimate how much of a text reads as AI-generated, based on style signals (generic phrasing, uniform sentence rhythm, hedged filler, listy structure). You cannot know for certain and you say so in the verdict. ${LANG}`,
    user: `Give: "percent" (0-100, share of the text that reads as AI-written), "verdict" (one sentence, including that this is an estimate), "passages" (up to 4 exact short quotes that read most AI-like, each with a short reason).\n\n<text>\n${text}\n</text>`,
    schema: AI_SCHEMA,
    signal,
  });
}

export interface PlagiarismResult {
  originalPercent: number;
  summary: string;
  matches: { quote: string; source: string; url: string; similarity: "exact" | "close" | "paraphrase" }[];
}

export interface CitationResult {
  claims: { claim: string; sources: { title: string; url: string; citation: string }[] }[];
}

/** Pull a JSON object out of a model answer that may wrap it in prose or a code fence. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/** Search the web for passages of the text that already exist online. */
export async function checkPlagiarism(apiKey: string | null, text: string, settings: Settings, signal?: AbortSignal) {
  const { text: answer, sources } = await runSearch(apiKey, settings, {
    system: `You are Matra's plagiarism checker. Search the web for the most distinctive sentences of the user's text and report passages that appear in, or closely paraphrase, published pages. Only report matches you actually found in search results; never invent sources. ${LANG}`,
    user: `Check this text. Answer with only a JSON object, no other text:\n{"originalPercent": <0-100, share of the text that looks original>, "summary": "<one sentence>", "matches": [{"quote": "<exact short quote from the text>", "source": "<page title>", "url": "<page url>", "similarity": "exact" | "close" | "paraphrase"}]}\nUse an empty "matches" list if nothing was found.\n\n<text>\n${text}\n</text>`,
    signal,
  });
  const parsed = extractJson<PlagiarismResult>(answer);
  if (!parsed) return { originalPercent: 100, summary: answer.trim().slice(0, 300) || "No matches found.", matches: [] };
  // Keep only links the search actually returned, so a made-up URL never reaches the user.
  const hosts = knownHosts(sources);
  parsed.matches = (parsed.matches ?? []).filter((m) => m.url && (hosts.size === 0 || hosts.has(host(m.url))));
  return parsed;
}

/** Find sources that support the text's claims and format citations. */
export async function findCitations(
  apiKey: string | null,
  text: string,
  style: "APA" | "MLA" | "Chicago",
  settings: Settings,
  signal?: AbortSignal,
) {
  const { text: answer, sources } = await runSearch(apiKey, settings, {
    system: `You are Matra's citation finder. Identify the main factual claims in the text, search the web for credible sources (official bodies, journals, reputable news, reference works) that support each, and format citations in ${style} style using the real page details. Never invent a source. ${LANG}`,
    user: `Answer with only a JSON object, no other text:\n{"claims": [{"claim": "<short claim from the text>", "sources": [{"title": "<page title>", "url": "<page url>", "citation": "<full ${style} citation>"}]}]}\nUp to 4 claims, up to 2 sources each. Skip claims that need no citation.\n\n<text>\n${text}\n</text>`,
    signal,
  });
  const parsed = extractJson<CitationResult>(answer) ?? { claims: [] };
  const hosts = knownHosts(sources);
  for (const c of parsed.claims ?? []) {
    c.sources = (c.sources ?? []).filter((s) => s.url && (hosts.size === 0 || hosts.has(host(s.url))));
  }
  parsed.claims = (parsed.claims ?? []).filter((c) => c.sources.length > 0);
  return parsed;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Sites the search really visited. Claude returns page URLs; Gemini returns redirect
 * links whose title is the site's domain, so both are used.
 */
export function knownHosts(sources: { title: string; url: string }[]): Set<string> {
  const out = new Set<string>();
  for (const s of sources) {
    const h = host(s.url);
    if (h && !h.endsWith("vertexaisearch.cloud.google.com")) out.add(h);
    const t = s.title.trim().toLowerCase().replace(/^www\./, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) out.add(t);
  }
  return out;
}
