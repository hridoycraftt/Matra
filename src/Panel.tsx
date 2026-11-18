import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./components/Editor";
import { GoalsMenu } from "./components/GoalsMenu";
import { IconCheck, IconGear, IconX, LogoMark } from "./components/Icons";
import { canAddWord, SidePanel } from "./components/SidePanel";
import {
  configureEverywhere,
  currentField,
  focusSource,
  hidePanel,
  openMain,
  sendBadge,
  setBadge,
  setUnderlines,
  showPanel,
  writeField,
  type FieldInfo,
  type PanelMode,
  type ScreenRect,
} from "./lib/everywhere";
import { inApp, onAppEvent, useApiKey, useSettings } from "./lib/platform";
import { CATEGORIES, DEFAULT_GOALS, PROVIDERS, type Goals, type Issue } from "./lib/types";
import { useAssistant, useSelectionWords } from "./lib/useAssistant";

const GOALS_KEY = "matra.panelGoals";
const PREVIEW_FIELD: FieldInfo = {
  app: "Mail",
  pid: 0,
  text: "Hi Sarah,\n\nThank you for you're quick reply. I has attached the files you asked for, let me know if their is anything else.\n\nBest regards",
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  field_id: 1,
};

function loadGoals(): Goals {
  try {
    return { ...DEFAULT_GOALS, ...JSON.parse(localStorage.getItem(GOALS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_GOALS;
  }
}

/**
 * Matra for other apps. This window is also the background checker: it follows the
 * focused text field, checks it after a pause, drives the badge, and opens itself
 * as a small suggestion card (or the full assistant) beside the field.
 */
export default function Panel() {
  const [settings, setSettings] = useSettings();
  const [apiKey] = useApiKey(settings.provider);
  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [field, setField] = useState<FieldInfo | null>(inApp ? null : PREVIEW_FIELD);
  const [text, setText] = useState(inApp ? "" : PREVIEW_FIELD.text);
  const [mode, setMode] = useState<PanelMode>(() =>
    !inApp && new URLSearchParams(location.search).get("mode") === "card" ? "card" : "full",
  );
  const [shown, setShown] = useState(!inApp);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const anchor = useRef<ScreenRect | undefined>(undefined);
  const editor = useRef<EditorHandle>(null);
  const fromField = useRef(false);
  const typed = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoOpened = useRef<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const a = useAssistant({
    text,
    setText: (next) => {
      setText(next);
      if (fromField.current) return;
      // A change made in Matra (accepted fix, rewrite, typing here): write it back to the app.
      clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        writeField(next)
          .then((how) => setWriteNote(how === "paste" ? "Pasted into the app." : null))
          .catch((e) => setWriteNote(`Couldn't update the app: ${e}`));
      }, 200);
    },
    goals,
    settings,
    apiKey,
    editor,
    onAddWord: (w) => setSettings({ ...settings, dictionary: [...new Set([...settings.dictionary, w])] }),
  });
  const selectionWords = useSelectionWords();

  useEffect(() => {
    configureEverywhere(settings);
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    } catch {
      /* ignore */
    }
  }, [goals]);

  const open = (m: PanelMode, focus: boolean, at?: ScreenRect) => {
    setMode(m);
    setShown(true);
    anchor.current = m === "card" ? at : undefined;
    showPanel(focus, m, undefined, anchor.current);
  };

  // Underline the suggestions inside the other app.
  useEffect(() => {
    setUnderlines(a.issues.map((i) => ({ id: i.id, start: i.start, len: i.end - i.start, category: i.category })));
  }, [a.issues]);

  // The caret moved onto an underlined word: open the card right there, like clicking an underline.
  useEffect(
    () =>
      onAppEvent<[string, [number, number, number, number] | null]>("matra://caret-issue", ([id, r]) => {
        setFocusId(id);
        open("card", false, r ? { x: r[0], y: r[1], w: r[2], h: r[3] } : undefined);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const close = () => {
    setShown(false);
    hidePanel();
  };

  // Follow the text field the user is typing in.
  useEffect(() => {
    const apply = (f: FieldInfo) => {
      setField((prev) => {
        if (!prev || prev.field_id !== f.field_id) {
          a.reset();
          typed.current = false;
          autoOpened.current = null;
          setText(f.text);
        } else if (f.text !== textRef.current) {
          typed.current = true;
          fromField.current = true;
          a.syncText(f.text);
          setText(f.text);
          fromField.current = false;
        }
        return f;
      });
    };
    currentField().then((f) => f && apply(f));
    const offs = [
      onAppEvent<FieldInfo>("matra://field", apply),
      onAppEvent("matra://field-cleared", () => {
        sendBadge({ status: "idle" });
        setBadge(false);
      }),
      onAppEvent<PanelMode | "write">("matra://mode", (m) => {
        if (m === "write") {
          a.setTab("write");
          open("full", true);
        } else if (m === "full" && !textRef.current.trim()) {
          open("card", true); // nothing written yet: a small "start writing" card, not a big empty panel
        } else {
          open(m, true);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Badge: only after the user has typed in this field, never just because it has focus.
  useEffect(() => {
    const status = a.check.status;
    if (status === "checking") sendBadge({ status: "checking" });
    else if (status === "error") sendBadge({ status: "error" });
    else if (status === "done") sendBadge(a.issues.length ? { status: "issues", count: a.issues.length } : { status: "clean" });
    else sendBadge({ status: "idle" });

    // A quiet dot whenever a text box is focused; it grows into a count or a check mark.
    setBadge(!!field);
    if (status === "done" && a.issues.length === 0) {
      const t = setTimeout(() => sendBadge({ status: "idle" }), 2500); // brief "all good", then back to the dot
      return () => clearTimeout(t);
    }
  }, [a.check.status, a.issues.length, field]);

  // Open the small card by itself when a check finds something new.
  useEffect(() => {
    if (a.check.status !== "done" || !field || !typed.current) return;
    if (a.issues.length === 0) {
      if (shown && mode === "card") close();
      return;
    }
    const key = `${field.field_id}:${a.issues.map((i) => i.id).join(",")}`;
    if (settings.autoOpenPanel && !shown && autoOpened.current !== key) {
      autoOpened.current = key;
      open("card", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.check.status, a.issues, settings.autoOpenPanel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const providerLabel = PROVIDERS.find((x) => x.id === settings.provider)!.label;

  if (mode === "card") {
    return (
      <SuggestionCard
        app={field?.app ?? "this app"}
        empty={!text.trim()}
        issues={a.issues}
        hasKey={!!apiKey}
        onAccept={(id) => {
          a.accept(id);
          focusSource();
        }}
        onDismiss={a.dismiss}
        onAddWord={a.addWord}
        onExpand={() => {
          if (!a.issues.length) a.setTab("write");
          open("full", true);
        }}
        onClose={close}
        focusId={focusId}
        onResize={(h) => shown && showPanel(false, "card", h, anchor.current)}
      />
    );
  }

  return (
    <div className="mini">
      <header className="mini-head" data-tauri-drag-region>
        <LogoMark size={20} />
        <div className="mini-title" data-tauri-drag-region>
          <strong>Matra</strong>
          <span className="muted">{field ? `in ${field.app}` : "Waiting for a text box…"}</span>
        </div>
        <GoalsMenu goals={goals} onChange={setGoals} compact />
        <button className="icon-btn" aria-label="Matra settings" onClick={() => openMain(true)}>
          <IconGear />
        </button>
        <button className="icon-btn" aria-label="Close panel (Esc)" onClick={close}>
          <IconX />
        </button>
      </header>

      <div className="mini-text">
        {field && text ? (
          <Editor
            ref={editor}
            text={text}
            issues={a.issues}
            activeId={a.activeIssue}
            onChange={a.onTextChange}
            onCaret={a.onCaret}
            compact
          />
        ) : (
          <p className="muted small">
            {field
              ? `Start typing in ${field.app}. Matra checks your text when you pause.`
              : "Click into any text box in another app and start typing. If an app's text can't be read, select it and press ⌃⌥M."}
          </p>
        )}
      </div>

      {writeNote && <div className="notice small mini-note">{writeNote}</div>}

      <SidePanel
        tab={a.tab}
        onTab={a.setTab}
        check={a.check}
        issues={a.issues}
        activeId={a.activeIssue}
        onActivate={a.activate}
        onAccept={a.accept}
        onDismiss={a.dismiss}
        onAddWord={a.addWord}
        onAcceptAll={a.acceptAll}
        hasKey={!!apiKey}
        providerLabel={providerLabel}
        onOpenSettings={() => openMain(true)}
        writer={a.writer}
        selectionWords={selectionWords}
        onRewrite={a.rewrite}
        onCompose={a.compose}
        onWriterApply={a.applyWriter}
        onWriterDiscard={a.discardWriter}
        onWriterStop={a.stopWriter}
        compact
      />

      <footer className="mini-foot">
        <span className="muted small">Accepted fixes go straight into {field?.app ?? "the app"}.</span>
        <button className="btn btn-primary btn-sm" onClick={close}>
          <IconCheck /> Done
        </button>
      </footer>
    </div>
  );
}

/** One suggestion at a time, small, next to the field — the card that opens by itself. */
function SuggestionCard(p: {
  app: string;
  empty: boolean;
  issues: Issue[];
  hasKey: boolean;
  onAccept(id: string): void;
  onDismiss(id: string): void;
  onAddWord(id: string): void;
  onExpand(): void;
  onClose(): void;
  onResize(height: number): void;
  focusId?: string | null;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const at = p.issues.findIndex((x) => x.id === p.focusId);
    if (at >= 0) setIndex(at);
  }, [p.focusId, p.issues]);
  const root = useRef<HTMLDivElement>(null);
  const i = Math.min(index, Math.max(0, p.issues.length - 1));
  const issue = p.issues[i];

  // Size the window to the card.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () => p.onResize(Math.ceil(el.getBoundingClientRect().height));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("is-card");
    return () => document.documentElement.classList.remove("is-card");
  }, []);

  return (
    <div className="sugg" ref={root} role="dialog" aria-label={`Matra suggestions for ${p.app}`}>
      <header className="sugg-head" data-tauri-drag-region>
        <LogoMark size={16} />
        <span className="sugg-count" data-tauri-drag-region>
          {issue ? `${p.issues.length} suggestion${p.issues.length === 1 ? "" : "s"}` : ""}
        </span>
        {p.issues.length > 1 && (
          <span className="sugg-nav">
            <button className="icon-btn" aria-label="Previous suggestion" onClick={() => setIndex((i - 1 + p.issues.length) % p.issues.length)}>‹</button>
            <span className="muted small">{i + 1}/{p.issues.length}</span>
            <button className="icon-btn" aria-label="Next suggestion" onClick={() => setIndex((i + 1) % p.issues.length)}>›</button>
          </span>
        )}
        <button className="btn btn-quiet btn-sm" onClick={p.onExpand}>{issue ? "Open Matra" : "Write with AI"}</button>
        <button className="icon-btn" aria-label="Close (Esc)" onClick={p.onClose}><IconX /></button>
      </header>
      {!p.hasKey ? (
        <p className="sugg-body muted small">Add your AI key in Matra's Settings to get suggestions.</p>
      ) : issue ? (
        <div className="sugg-body" key={issue.id}>
          <div className="sugg-title">
            <i className={`dot dot-${issue.category}`} aria-hidden="true" />
            <span>{issue.title}</span>
            <span className="muted small">· {CATEGORIES.find((c) => c.id === issue.category)?.label}</span>
          </div>
          <div className="sugg-fix">
            <del>{issue.original}</del>
            <span aria-hidden="true" className="muted">→</span>
            <button className={`sugg-chip sugg-chip-${issue.category}`} onClick={() => p.onAccept(issue.id)} title="Accept">
              {issue.replacement || "(remove)"}
            </button>
          </div>
          <p className="sugg-why">{issue.explanation}</p>
          <div className="sugg-actions">
            <button className="btn btn-primary btn-sm" onClick={() => p.onAccept(issue.id)}>Accept</button>
            <button className="btn btn-quiet btn-sm" onClick={() => p.onDismiss(issue.id)}>Dismiss</button>
            {canAddWord(issue) && (
              <button className="btn btn-quiet btn-sm" onClick={() => p.onAddWord(issue.id)}>Add to dictionary</button>
            )}
          </div>
        </div>
      ) : p.empty ? (
        <div className="sugg-hero">
          <LogoMark size={40} />
          <strong>Start writing — Matra checks as you type.</strong>
          <span className="muted small">Suggestions will appear here.</span>
        </div>
      ) : (
        <div className="sugg-hero">
          <span className="sugg-ok" aria-hidden="true">
            <IconCheck size={18} />
          </span>
          <strong>Looking good</strong>
          <span className="muted small">No suggestions in {p.app} right now.</span>
        </div>
      )}
    </div>
  );
}
