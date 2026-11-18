export type Category = "correctness" | "clarity" | "engagement" | "delivery";

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "correctness", label: "Correctness", hint: "Spelling, grammar, punctuation" },
  { id: "clarity", label: "Clarity", hint: "Wordy or hard-to-follow sentences" },
  { id: "engagement", label: "Engagement", hint: "Word choice and variety" },
  { id: "delivery", label: "Delivery", hint: "Tone, formality, confidence" },
];

/** An issue as the model returns it: located by exact text, not by offset. */
export interface RawIssue {
  category: Category;
  original: string;
  replacement: string;
  prefix: string;
  title: string;
  explanation: string;
}

/** An issue pinned to a range in the current text. */
export interface Issue extends RawIssue {
  id: string;
  start: number;
  end: number;
}

export interface CheckResult {
  language: "en" | "bn" | "mixed" | "banglish";
  score: number;
  tone_labels: string[];
  tone_summary: string;
  issues: RawIssue[];
}

export interface Goals {
  audience: "general" | "knowledgeable" | "expert";
  formality: "informal" | "neutral" | "formal";
  domain: "general" | "academic" | "business" | "email" | "creative" | "social";
  intent: "inform" | "convince" | "describe" | "tell_story";
}

export const DEFAULT_GOALS: Goals = {
  audience: "general",
  formality: "neutral",
  domain: "general",
  intent: "inform",
};

export interface MatraDoc {
  id: string;
  title: string;
  text: string;
  goals: Goals;
  updatedAt: number;
}

export type RewriteMode =
  | "improve"
  | "shorten"
  | "expand"
  | "formal"
  | "friendly"
  | "confident"
  | "simplify"
  | "to_bangla"
  | "to_english"
  | "banglish_to_bangla"
  | "custom";

export const REWRITE_MODES: { id: RewriteMode; label: string; group: "style" | "language" }[] = [
  { id: "improve", label: "Improve it", group: "style" },
  { id: "shorten", label: "Make shorter", group: "style" },
  { id: "expand", label: "Make longer", group: "style" },
  { id: "simplify", label: "Simplify", group: "style" },
  { id: "formal", label: "More formal", group: "style" },
  { id: "friendly", label: "More friendly", group: "style" },
  { id: "confident", label: "More confident", group: "style" },
  { id: "banglish_to_bangla", label: "Banglish → Bangla", group: "language" },
  { id: "to_bangla", label: "Translate to Bangla", group: "language" },
  { id: "to_english", label: "Translate to English", group: "language" },
];

export interface Settings {
  model: string;
  autoCheck: boolean;
  englishDialect: "US" | "UK";
  explanationLanguage: "auto" | "en" | "bn";
}

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Best quality" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Faster, cheaper" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest, cheapest" },
];

export const DEFAULT_SETTINGS: Settings = {
  model: "claude-opus-5-5",
  autoCheck: true,
  englishDialect: "US",
  explanationLanguage: "auto",
};
