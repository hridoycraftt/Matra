import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./components/Editor";
import { GoalsMenu } from "./components/GoalsMenu";
import { IconCheck, IconGear, IconPlus, IconTrash, LogoMark } from "./components/Icons";
import { SettingsSheet } from "./components/SettingsSheet";
import { SidePanel, type CheckView, type WriterView } from "./components/SidePanel";
import { checkText, MAX_CHECK_CHARS, streamCompose, streamRewrite, friendlyError } from "./lib/ai";
import { applyIssue, locateIssues, remapIssues } from "./lib/locate";
import { clearApiKey, inApp, loadApiKey, saveApiKey } from "./lib/platform";
import { computeStats, formatMinutes } from "./lib/stats";
import { docTitle, loadActiveId, loadDocs, loadSettings, newDoc, saveActiveId, saveDocs, saveSettings } from "./lib/storage";
import type { Category, Issue, MatraDoc, RewriteMode, Settings } from "./lib/types";
import { checkForUpdate, type UpdateState } from "./lib/updater";

const AUTO_CHECK_DELAY = 1600;

export default function App() {
  const [docs, setDocs] = useState<MatraDoc[]>(loadDocs);
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadActiveId();
    const all = loadDocs();
    return saved && all.some((d) => d.id === saved) ? saved : all[0].id;
  });
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  const [issues, setIssues] = useState<Issue[]>([]);
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckView>({ status: "idle" });
  const [tab, setTab] = useState<"review" | "write">("review");
  const [writer, setWriter] = useState<WriterView | null>(null);
  const [selectionWords, setSelectionWords] = useState(0);

  const editor = useRef<EditorHandle>(null);
  const doc = docs.find((d) => d.id === activeId) ?? docs[0];
  const textRef = useRef(doc.text);
  textRef.current = doc.text;
  const checkAbort = useRef<AbortController | null>(null);
  const writerAbort = useRef<AbortController | null>(null);
  const writerRange = useRef<{ start: number; end: number; source: string } | null>(null);
  const lastChecked = useRef<string>("");

  // ---------- persistence ----------
  useEffect(() => saveDocs(docs), [docs]);
  useEffect(() => saveActiveId(activeId), [activeId]);
  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  useEffect(() => {
    loadApiKey().then(setApiKey).catch(() => setApiKey(null));
  }, []);

  // Quietly look for an update shortly after launch; the user installs it from Settings.
  useEffect(() => {
    if (!inApp) return;
    const t = setTimeout(async () => {
      const s = await checkForUpdate();
      if (s.status === "available") setUpdate(s);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  // ---------- documents ----------
  const patchDoc = useCallback((id: string, patch: Partial<MatraDoc>) => {
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)));
  }, []);

  const resetReview = () => {
    checkAbort.current?.abort();
    setIssues([]);
    setActiveIssue(null);
    setCheck({ status: "idle" });
    lastChecked.current = "";
  };

  const openDoc = (id: string) => {
    if (id === activeId) return;
    resetReview();
    setWriter(null);
    setActiveId(id);
  };

  const createDoc = () => {
    const d = newDoc();
    setDocs((all) => [d, ...all]);
    resetReview();
    setWriter(null);
    setActiveId(d.id);
    requestAnimationFrame(() => editor.current?.focus());
  };

  const deleteDoc = (id: string) => {
    setDocs((all) => {
      const rest = all.filter((d) => d.id !== id);
      const next = rest.length ? rest : [newDoc()];
      if (id === activeId) {
        resetReview();
        setActiveId(next[0].id);
      }
      return next;
    });
  };

  const onText = (text: string) => {
    setIssues((prev) => remapIssues(doc.text, text, prev));
    patchDoc(doc.id, { text });
  };

  // ---------- checking ----------
  const runCheck = useCallback(async () => {
    const text = textRef.current;
    if (!text.trim()) {
      setIssues([]);
      setCheck({ status: "idle" });
      return;
    }
    checkAbort.current?.abort();
    const ctrl = new AbortController();
    checkAbort.current = ctrl;
    lastChecked.current = text;
    setCheck((c) => ({ ...c, status: "checking", error: undefined }));
    try {
      const result = await checkText(apiKey, text, doc.goals, settings, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const located = locateIssues(text, result.issues);
      // The user may have kept typing while we waited.
      setIssues(remapIssues(text, textRef.current, located));
      setCheck({
        status: "done",
        score: result.score,
        toneLabels: result.tone_labels,
        toneSummary: result.tone_summary,
        truncated: text.length > MAX_CHECK_CHARS,
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setCheck((c) => ({ ...c, status: "error", error: friendlyError(err).message }));
    }
  }, [apiKey, doc.goals, settings]);

  useEffect(() => {
    if (!settings.autoCheck || !apiKey) return;
    if (!doc.text.trim() || doc.text === lastChecked.current) return;
    const t = setTimeout(runCheck, AUTO_CHECK_DELAY);
    return () => clearTimeout(t);
  }, [doc.text, settings.autoCheck, apiKey, runCheck]);

  // Goals change what counts as a problem: re-check.
  const goalsKey = JSON.stringify(doc.goals);
  const prevGoals = useRef(goalsKey);
  useEffect(() => {
    if (prevGoals.current === goalsKey) return;
    prevGoals.current = goalsKey;
    lastChecked.current = "";
    if (apiKey && settings.autoCheck) runCheck();
  }, [goalsKey, apiKey, settings.autoCheck, runCheck]);

  const accept = (id: string) => {
    const r = applyIssue(doc.text, issues, id);
    lastChecked.current = r.text; // a fix is not a reason to re-check everything
    setIssues(r.issues);
    patchDoc(doc.id, { text: r.text });
    setActiveIssue(null);
  };
  const dismiss = (id: string) => setIssues((all) => all.filter((i) => i.id !== id));
  const acceptAll = (cat: Category | "all") => {
    let text = doc.text;
    let list = issues;
    for (const i of [...issues].filter((i) => cat === "all" || i.category === cat).sort((a, b) => b.start - a.start)) {
      const r = applyIssue(text, list, i.id);
      text = r.text;
      list = r.issues;
    }
    lastChecked.current = text;
    setIssues(list);
    patchDoc(doc.id, { text });
  };
  const activate = (id: string) => {
    setActiveIssue(id);
    const i = issues.find((x) => x.id === id);
    if (i) editor.current?.select(i.start, i.end);
  };

  // ---------- AI writing ----------
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
    const sel = editor.current?.selection() ?? { start: 0, end: 0 };
    const hasSel = sel.end > sel.start;
    const start = hasSel ? sel.start : 0;
    const end = hasSel ? sel.end : doc.text.length;
    const source = doc.text.slice(start, end);
    if (!source.trim()) return;
    writerRange.current = { start, end, source };
    const label = mode === "custom" ? "Custom rewrite" : `Rewrite · ${mode.replace(/_/g, " ")}`;
    startWriter({ kind: "rewrite", label, hasRange: true }, (on, signal) =>
      streamRewrite(apiKey, { text: source, mode, custom, goals: doc.goals, settings }, on, signal),
    );
  };

  const compose = (prompt: string) => {
    const sel = editor.current?.selection() ?? { start: doc.text.length, end: doc.text.length };
    writerRange.current = { start: sel.end, end: sel.end, source: "" };
    startWriter({ kind: "compose", label: "New writing", hasRange: false }, (on, signal) =>
      streamCompose(apiKey, { prompt, context: doc.text, goals: doc.goals, settings }, on, signal),
    );
  };

  const applyWriter = (how: "replace" | "insert") => {
    if (!writer?.output) return;
    const range = writerRange.current;
    const text = doc.text;
    let next: string;
    let caret: number;
    if (how === "replace" && range && text.slice(range.start, range.end) === range.source) {
      next = text.slice(0, range.start) + writer.output + text.slice(range.end);
      caret = range.start + writer.output.length;
    } else {
      const at = range ? Math.min(range.end, text.length) : text.length;
      const before = text.slice(0, at);
      const gap = before && !before.endsWith("\n") ? "\n\n" : "";
      next = before + gap + writer.output + text.slice(at);
      caret = at + gap.length + writer.output.length;
    }
    setIssues((prev) => remapIssues(text, next, prev));
    patchDoc(doc.id, { text: next });
    setWriter(null);
    requestAnimationFrame(() => editor.current?.select(caret, caret));
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "n") {
        e.preventDefault();
        createDoc();
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === "Enter" && document.activeElement?.classList.contains("editor-input")) {
        e.preventDefault();
        runCheck();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const onSel = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLTextAreaElement) || !el.classList.contains("editor-input")) return;
      const s = el.value.slice(el.selectionStart, el.selectionEnd).trim();
      setSelectionWords(s ? s.split(/\s+/).length : 0);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const stats = useMemo(() => computeStats(doc.text), [doc.text]);
  const sorted = useMemo(() => [...docs].sort((a, b) => b.updatedAt - a.updatedAt), [docs]);

  return (
    <div className={`app${inApp ? " in-app" : ""}`}>
      <nav className="sidebar" aria-label="Documents">
        <div className="titlebar-space" data-tauri-drag-region />
        <div className="brand" data-tauri-drag-region>
          <LogoMark size={24} />
          <span className="wordmark">Matra</span>
        </div>
        <button className="btn btn-new" onClick={createDoc}>
          <IconPlus /> New document <kbd>⌘N</kbd>
        </button>
        <ul className="doc-list">
          {sorted.map((d) => (
            <li key={d.id}>
              <button
                className={`doc-item${d.id === doc.id ? " is-active" : ""}`}
                onClick={() => openDoc(d.id)}
                aria-current={d.id === doc.id ? "page" : undefined}
              >
                <span className="doc-name">{docTitle(d)}</span>
                <span className="doc-meta">{relativeTime(d.updatedAt)}</span>
              </button>
              <button className="icon-btn doc-delete" aria-label={`Delete ${docTitle(d)}`} onClick={() => deleteDoc(d.id)}>
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-side" onClick={() => setSettingsOpen(true)}>
          <IconGear /> Settings
          {update.status === "available" && <span className="badge">Update</span>}
        </button>
      </nav>

      <main className="main">
        <header className="toolbar" data-tauri-drag-region>
          <input
            className="title-input"
            value={doc.title}
            placeholder={docTitle(doc)}
            onChange={(e) => patchDoc(doc.id, { title: e.target.value })}
            aria-label="Document title"
          />
          <div className="toolbar-actions">
            <GoalsMenu goals={doc.goals} onChange={(g) => patchDoc(doc.id, { goals: g })} />
            <button
              className="btn btn-primary"
              onClick={() => {
                setTab("review");
                runCheck();
              }}
              disabled={!apiKey || check.status === "checking"}
              title="Check now (⌘↩)"
            >
              <IconCheck /> {check.status === "checking" ? "Checking…" : "Check"}
            </button>
          </div>
        </header>
        <div className="page-scroll">
          <article className="page">
            <Editor
              ref={editor}
              text={doc.text}
              issues={issues}
              activeId={activeIssue}
              onChange={onText}
              onCaret={(pos) => {
                const hit = issues.find((i) => pos >= i.start && pos <= i.end);
                setActiveIssue(hit?.id ?? null);
                if (hit) setTab("review");
              }}
              placeholder="Start writing in English or Bangla…"
            />
          </article>
        </div>
        <footer className="statusbar" aria-label="Document statistics">
          <span>{stats.words.toLocaleString()} words</span>
          <span>{stats.characters.toLocaleString()} characters</span>
          <span>{formatMinutes(stats.readingMinutes)} read</span>
          <span className="hide-narrow">{formatMinutes(stats.speakingMinutes)} to speak</span>
          {stats.readability !== null && <span className="hide-narrow">Readability {stats.readability}</span>}
        </footer>
      </main>

      <SidePanel
        tab={tab}
        onTab={setTab}
        check={check}
        issues={issues}
        activeId={activeIssue}
        onActivate={activate}
        onAccept={accept}
        onDismiss={dismiss}
        onAcceptAll={acceptAll}
        hasKey={!!apiKey}
        onOpenSettings={() => setSettingsOpen(true)}
        writer={writer}
        selectionWords={selectionWords}
        onRewrite={rewrite}
        onCompose={compose}
        onWriterApply={applyWriter}
        onWriterDiscard={() => setWriter(null)}
        onWriterStop={() => writerAbort.current?.abort()}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettings={setSettings}
        hasKey={!!apiKey}
        onSaveKey={async (k) => {
          await saveApiKey(k);
          setApiKey(k);
          lastChecked.current = "";
        }}
        onClearKey={async () => {
          await clearApiKey();
          setApiKey(null);
        }}
        update={update}
        onUpdate={setUpdate}
      />
    </div>
  );
}

function relativeTime(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
