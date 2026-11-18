import { DEFAULT_GOALS, DEFAULT_SETTINGS, type MatraDoc, type Settings } from "./types";

const DOCS = "matra.docs.v1";
const SETTINGS = "matra.settings.v1";
const ACTIVE = "matra.activeDoc";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

export const WELCOME_TEXT = `Welcome to Matra.

Matra checks you're writing in English and Bangla as you type. Their are a few mistakes in this paragraph so you can see how it work.

আমি কাল অফিসে যাবো এবং মিটিং এ অংশগ্রহন করিব।

ami kal tomake phone dibo.`;

export function newDoc(text = ""): MatraDoc {
  return {
    id: crypto.randomUUID(),
    title: "",
    text,
    goals: { ...DEFAULT_GOALS },
    updatedAt: Date.now(),
  };
}

export function loadDocs(): MatraDoc[] {
  const docs = read<MatraDoc[]>(DOCS, []);
  if (docs.length) return docs.map((d) => ({ ...d, goals: { ...DEFAULT_GOALS, ...d.goals } }));
  const welcome = { ...newDoc(WELCOME_TEXT), title: "Welcome to Matra" };
  return [welcome];
}
export const saveDocs = (docs: MatraDoc[]) => write(DOCS, docs);

export const loadActiveId = () => read<string | null>(ACTIVE, null);
export const saveActiveId = (id: string) => write(ACTIVE, id);

export function loadSettings(): Settings {
  const saved = read<Partial<Settings> & { model?: string }>(SETTINGS, {});
  // v0.1 stored a single Claude model and had no provider choice.
  if (saved.model && !saved.anthropicModel) {
    saved.anthropicModel = saved.model;
    saved.provider ??= "anthropic";
  }
  delete saved.model;
  return { ...DEFAULT_SETTINGS, ...saved };
}
export const SETTINGS_KEY = SETTINGS;
export const saveSettings = (s: Settings) => write(SETTINGS, s);

export function docTitle(d: MatraDoc): string {
  if (d.title.trim()) return d.title.trim();
  const first = d.text.trim().split("\n")[0]?.trim();
  return first ? first.slice(0, 48) : "Untitled";
}
