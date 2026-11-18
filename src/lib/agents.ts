import { runJson } from "./ai";
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
