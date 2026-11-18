import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditorHandle } from "../components/Editor";
import type { CheckView, WriterView } from "../components/SidePanel";
import { checkText, friendlyError, MAX_CHECK_CHARS, streamCompose, streamRewrite } from "./ai";
import { applyIssue, locateIssues, remapIssues } from "./locate";
import { checkPunctuation } from "./punctuation";
import { rejectKey, type Category, type Goals, type Issue, type RewriteMode, type Settings } from "./types";

const AUTO_CHECK_DELAY = 1600;

interface Options {
  text: string;
  setText(next: string): void;
  goals: Goals;
  settings: Settings;
  apiKey: string | null;
  editor: RefObject<EditorHandle | null>;
  /** Save a word to the personal dictionary. */
  onAddWord?(word: string): void;
  /** "Turn off suggestions like this": never show this kind of suggestion again. */
  onMute?(kind: string): void;
  /** "Incorrect suggestion": never suggest this exact change again. */
  onReject?(key: string): void;
}

/**
 * Everything Matra does to one piece of text: checking, suggestions, rewrite and compose.
 * Used by the main window and by the floating assistant that works in other apps.
 */
export function useAssistant({ text, setText, goals, settings, apiKey, editor, onAddWord, onMute, onReject }: Options) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckView>({ status: "idle" });
  const [tab, setTab] = useState<"review" | "write" | "agents">("review");
  const [writer, setWriter] = useState<WriterView | null>(null);

  const textRef = useRef(text);
  textRef.current = text;
  const checkAbort = useRef<AbortController | null>(null);
  const writerAbort = useRef<AbortController | null>(null);
  const writerRange = useRef<{ start: number; end: number; source: string } | null>(null);
  const lastRun = useRef<(() => void) | null>(null);
  const lastChecked = useRef("");

  /** Clear everything, e.g. when another document or another captured text is opened. */
  const reset = useCallback(() => {
    checkAbort.current?.abort();
    writerAbort.current?.abort();
    setIssues([]);
    setActiveIssue(null);
    setCheck({ status: "idle" });
    setWriter(null);
    lastChecked.current = "";
  }, []);

  /** The user typed: keep suggestions that still match. */
  const onTextChange = (next: string) => {
    setIssues((prev) => remapIssues(textRef.current, next, prev));
    setText(next);
  };

  /** The text changed outside Matra (e.g. typed in another app): keep suggestions that still match. */
  const syncText = (next: string) => {
    if (next === textRef.current) return;
    setIssues((prev) => remapIssues(textRef.current, next, prev));
    textRef.current = next;
  };

  const runCheck = useCallback(async () => {
    const current = textRef.current;
    if (!current.trim()) {
      setIssues([]);
      setCheck({ status: "idle" });
      return;
    }
    checkAbort.current?.abort();
    const ctrl = new AbortController();
    checkAbort.current = ctrl;
    lastChecked.current = current;
    setCheck((c) => ({ ...c, status: "checking", error: undefined }));
    try {
      const result = await checkText(apiKey, current, goals, settings, ctrl.signal);
      if (ctrl.signal.aborted) return;
      // Matra's own punctuation checks first: they are exact, so they win any overlap.
      const located = locateIssues(current, [...checkPunctuation(current), ...result.issues]);
      // The user may have kept typing while we waited.
      setIssues(remapIssues(current, textRef.current, located));
      setCheck({
        status: "done",
        score: result.score,
        toneLabels: result.tone_labels,
        toneSummary: result.tone_summary,
        truncated: current.length > MAX_CHECK_CHARS,
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      // Even without the AI, the built-in punctuation checks still help.
      setIssues(remapIssues(current, textRef.current, locateIssues(current, checkPunctuation(current))));
      setCheck((c) => ({ ...c, status: "error", error: friendlyError(err).message }));
    }
  }, [apiKey, goals, settings]);

  // Check automatically when the user pauses.
  useEffect(() => {
    if (!settings.autoCheck || !apiKey) return;
    if (!text.trim() || text === lastChecked.current) return;
    const t = setTimeout(runCheck, AUTO_CHECK_DELAY);
    return () => clearTimeout(t);
  }, [text, settings.autoCheck, apiKey, runCheck]);

  // Goals change what counts as a problem: re-check.
  const goalsKey = JSON.stringify(goals);
  const prevGoals = useRef(goalsKey);
  useEffect(() => {
    if (prevGoals.current === goalsKey) return;
    prevGoals.current = goalsKey;
    lastChecked.current = "";
    if (apiKey && settings.autoCheck) runCheck();
  }, [goalsKey, apiKey, settings.autoCheck, runCheck]);

  const commit = (next: string, nextIssues: Issue[]) => {
    lastChecked.current = next; // accepting a fix is not a reason to re-check everything
    setIssues(nextIssues);
    setText(next);
  };

  /** Apply a suggestion, optionally with one of its alternative fixes. */
  const accept = (id: string, replacement?: string) => {
    const r = applyIssue(textRef.current, issues, id, replacement);
    commit(r.text, r.issues);
    setActiveIssue(null);
  };
  const dismiss = (id: string) => setIssues((all) => all.filter((i) => i.id !== id));
  const mute = (id: string) => {
    const kind = issues.find((i) => i.id === id)?.title.trim();
    if (!kind) return;
    onMute?.(kind);
    setIssues((all) => all.filter((i) => i.title.trim().toLowerCase() !== kind.toLowerCase()));
  };
  const report = (id: string) => {
    const i = issues.find((x) => x.id === id);
    if (!i) return;
    onReject?.(rejectKey(i.original, i.replacement));
    dismiss(id);
  };
  /** "Add to dictionary": stop flagging this word, here and in every later check. */
  const addWord = (id: string) => {
    const word = issues.find((i) => i.id === id)?.original.trim();
    if (!word) return;
    onAddWord?.(word);
    setIssues((all) => all.filter((i) => i.original.trim().toLowerCase() !== word.toLowerCase()));
  };
  const acceptAll = (cat: Category | "all") => {
    let next = textRef.current;
    let list = issues;
    for (const i of [...issues].filter((i) => cat === "all" || i.category === cat).sort((a, b) => b.start - a.start)) {
      const r = applyIssue(next, list, i.id);
      next = r.text;
      list = r.issues;
    }
    commit(next, list);
  };
  const activate = (id: string) => {
    setActiveIssue(id);
    const i = issues.find((x) => x.id === id);
    if (i) editor.current?.select(i.start, i.end);
  };
  const onCaret = (pos: number) => {
    const hit = issues.find((i) => pos >= i.start && pos <= i.end);
    setActiveIssue(hit?.id ?? null);
    if (hit) setTab("review");
  };

  const startWriter = async (
    view: Omit<WriterView, "output" | "streaming">,
    run: (onText: (s: string) => void, signal: AbortSignal) => Promise<string>,
  ) => {
    writerAbort.current?.abort();
    const ctrl = new AbortController();
    writerAbort.current = ctrl;
    setTab("write");
    setWriter({ ...view, output: "", streaming: true });
    try {
      const out = await run((s) => setWriter((w) => (w ? { ...w, output: s } : w)), ctrl.signal);
      setWriter((w) => (w ? { ...w, output: out, streaming: false } : w));
    } catch (err) {
      if (ctrl.signal.aborted) {
        setWriter((w) => (w ? { ...w, streaming: false } : w));
        return;
      }
      setWriter((w) => (w ? { ...w, streaming: false, error: friendlyError(err).message } : w));
    }
  };

  const rewrite = (mode: RewriteMode, custom?: string) => {
    const current = textRef.current;
    const sel = editor.current?.selection() ?? { start: 0, end: 0 };
    const hasSel = sel.end > sel.start;
    const start = hasSel ? sel.start : 0;
    const end = hasSel ? sel.end : current.length;
    const source = current.slice(start, end);
    if (!source.trim()) return;
    writerRange.current = { start, end, source };
    lastRun.current = () => {
      writerRange.current = { start, end, source };
      startWriter({ kind: "rewrite", label, hasRange: true }, (on, signal) =>
        streamRewrite(apiKey, { text: source, mode, custom, goals, settings }, on, signal),
      );
    };
    const label = mode === "custom" ? "Custom rewrite" : `Rewrite · ${mode.replace(/_/g, " ")}`;
    startWriter({ kind: "rewrite", label, hasRange: true }, (on, signal) =>
      streamRewrite(apiKey, { text: source, mode, custom, goals, settings }, on, signal),
    );
  };

  const compose = (prompt: string) => {
    const current = textRef.current;
    const sel = editor.current?.selection() ?? { start: current.length, end: current.length };
    writerRange.current = { start: sel.end, end: sel.end, source: "" };
    lastRun.current = () => compose(prompt);
    startWriter({ kind: "compose", label: "New writing", hasRange: false }, (on, signal) =>
      streamCompose(apiKey, { prompt, context: current, goals, settings }, on, signal),
    );
  };

  const applyWriter = (how: "replace" | "insert") => {
    if (!writer?.output) return;
    const range = writerRange.current;
    const current = textRef.current;
    let next: string;
    let caret: number;
    if (how === "replace" && range && current.slice(range.start, range.end) === range.source) {
      next = current.slice(0, range.start) + writer.output + current.slice(range.end);
      caret = range.start + writer.output.length;
    } else {
      const at = range ? Math.min(range.end, current.length) : current.length;
      const before = current.slice(0, at);
      const gap = before && !before.endsWith("\n") ? "\n\n" : "";
      next = before + gap + writer.output + current.slice(at);
      caret = at + gap.length + writer.output.length;
    }
    setIssues((prev) => remapIssues(current, next, prev));
    setText(next);
    setWriter(null);
    requestAnimationFrame(() => editor.current?.select(caret, caret));
  };

  return {
    issues,
    activeIssue,
    check,
    tab,
    setTab,
    writer,
    reset,
    onTextChange,
    syncText,
    runCheck,
    accept,
    dismiss,
    addWord,
    mute,
    report,
    acceptAll,
    activate,
    onCaret,
    rewrite,
    compose,
    applyWriter,
    discardWriter: () => setWriter(null),
    /** Run the last rewrite or compose again for a different version. */
    regenerate: () => lastRun.current?.(),
    stopWriter: () => writerAbort.current?.abort(),
    /** Forget the last checked text so the next pause triggers a check (e.g. after adding a key). */
    invalidate: () => {
      lastChecked.current = "";
    },
  };
}

/** Word count of the current selection in the focused Matra editor. */
export function useSelectionWords() {
  const [words, setWords] = useState(0);
  useEffect(() => {
    const onSel = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLTextAreaElement) || !el.classList.contains("editor-input")) return;
      const s = el.value.slice(el.selectionStart, el.selectionEnd).trim();
      setWords(s ? s.split(/\s+/).length : 0);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  return words;
}
