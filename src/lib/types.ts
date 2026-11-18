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
  /** Other good fixes for the same span, best first (may be empty). */
  alternatives?: string[];
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

export type Provider = "google" | "anthropic";

export interface Settings {
  provider: Provider;
  anthropicModel: string;
  googleModel: string;
  autoCheck: boolean;
  englishDialect: "US" | "UK";
  explanationLanguage: "auto" | "en" | "bn";
  /** Watch text fields in other apps. */
  everywhere: boolean;
  /** Open the suggestion panel by itself when a mistake is found in another app. */
  autoOpenPanel: boolean;
  ignoredApps: string[];
  /** Words Matra should never flag as misspelled (names, jargon, Banglish words). */
  dictionary: string[];
  /** The writer's own house style rules, one per line. */
  styleRules: string;
  /** Where the user dragged the badge, per app name: [dx, dy] from the field's corner. */
  badgeOffsets: Record<string, [number, number]>;
  /** Kinds of suggestion (by title) the writer turned off. */
  mutedKinds: string[];
  /** Exact changes the writer marked as incorrect (see rejectKey). */
  rejected: string[];
  /** Saved text: type the trigger (e.g. ";sig") and a space to insert it. */
  snippets: { trigger: string; text: string }[];
  /** "color": colored lines; "patterns": each category also gets its own line pattern. */
  underlineStyle: "color" | "patterns";
  /** The first-run guide has been finished or skipped. */
  onboarded: boolean;
  /** The writer's voice, learned from their own samples, used for rewrites and new writing. */
  voice: { samples: string; profile: string; traits: string[]; enabled: boolean };
  /** Show rewrite actions when text is selected in another app. */
  selectionActions: boolean;
}

/** Identifies one exact change, for "Incorrect suggestion". */
export const rejectKey = (original: string, replacement: string) => `${original.trim()}\u2192${replacement.trim()}`.toLowerCase();

export const PROVIDERS: { id: Provider; label: string; keyHint: string; keyUrl: string; placeholder: string }[] = [
  {
    id: "google",
    label: "Google Gemini",
    keyHint: "Free key from Google AI Studio",
    keyUrl: "aistudio.google.com/apikey",
    placeholder: "AIza…",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    keyHint: "Paid key from the Anthropic Console",
    keyUrl: "console.anthropic.com",
    placeholder: "sk-ant-…",
  },
];

export const ANTHROPIC_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Best quality" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Faster, cheaper" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest, cheapest" },
];

/** Google's alias that always points at the newest Flash model (free tier in AI Studio). */
export const DEFAULT_GOOGLE_MODEL = "gemini-flash-latest";

export const DEFAULT_SETTINGS: Settings = {
  provider: "google",
  anthropicModel: "claude-opus-5-5",
  googleModel: DEFAULT_GOOGLE_MODEL,
  autoCheck: true,
  englishDialect: "US",
  explanationLanguage: "auto",
  everywhere: true,
  autoOpenPanel: true,
  ignoredApps: [],
  dictionary: [],
  styleRules: "",
  badgeOffsets: {},
  mutedKinds: [],
  rejected: [],
  snippets: [],
  underlineStyle: "color",
  onboarded: false,
  voice: { samples: "", profile: "", traits: [], enabled: false },
  selectionActions: true,
};

export function activeModel(s: Settings): string {
  return s.provider === "google" ? s.googleModel : s.anthropicModel;
}
