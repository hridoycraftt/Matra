import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./components/Editor";
import { GoalsMenu } from "./components/GoalsMenu";
import { IconArrowRight, IconCheck, IconChevron, IconGear, IconSpark, IconTrash, IconX, LogoMark } from "./components/Icons";
import { IssueMenu } from "./components/IssueMenu";
import { changedParts } from "./lib/diff";
import { SidePanel } from "./components/SidePanel";
import {
  configureEverywhere,
  currentField,
  focusSource,
  hidePanel,
  openMain,
  sendBadge,
  setBadge,
  setCaret,
  pauseApp,
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
import { expandSnippet } from "./lib/snippets";
import { streamCompose, streamRewrite, friendlyError } from "./lib/ai";
import { SelectionPill } from "./components/SelectionPill";
import type { RewriteMode } from "./lib/types";
import { useUnderlineStyle } from "./lib/useUnderlineStyle";

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
  useUnderlineStyle(settings);
  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [field, setField] = useState<FieldInfo | null>(inApp ? null : PREVIEW_FIELD);
  const [text, setText] = useState(inApp ? "" : PREVIEW_FIELD.text);
  const [mode, setMode] = useState<PanelMode>(() => {
    const m = !inApp ? new URLSearchParams(location.search).get("mode") : null;
    return m === "card" || m === "word" ? m : "full";
  });
  const [shown, setShown] = useState(!inApp);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  /** The badge's bulb opens improvements, its red count opens corrections. */
  /** Small cards opened from the badge: Write with AI, or "turn off here". */
  const [extra, setExtra] = useState<"ai" | "turnoff" | null>(() => {
    const m = !inApp ? new URLSearchParams(location.search).get("card") : null;
    return m === "ai" || m === "turnoff" ? m : null;
  });
  const [group, setGroup] = useState<"all" | "corrections" | "improvements">(() => {
    const g = !inApp ? new URLSearchParams(location.search).get("group") : null;
    return g === "corrections" || g === "improvements" ? g : "all";
  });
  const anchor = useRef<ScreenRect | undefined>(undefined);
  const editor = useRef<EditorHandle>(null);
  const fromField = useRef(false);
  const typed = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoOpened = useRef<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** Text selected in the other app, offered for a quick rewrite. */
  const [selection, setSelection] = useState<{ start: number; len: number; text: string } | null>(() => {
    // Browser preview: ?view=panel&mode=card&sel shows the rewrite card for a sample selection.
    if (inApp || !new URLSearchParams(location.search).has("sel")) return null;
    const t = "Thank you for you're quick reply.";
    return { start: PREVIEW_FIELD.text.indexOf(t), len: t.length, text: t };
  });
  const selTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selKey = useRef("");

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
    onMute: (k) => setSettings({ ...settings, mutedKinds: [...new Set([...settings.mutedKinds, k])] }),
    onReject: (r) => setSettings({ ...settings, rejected: [...new Set([...settings.rejected, r])].slice(-300) }),
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
    anchor.current = m === "card" || m === "word" ? at : undefined;
    showPanel(focus, m, undefined, anchor.current);
  };

  // Underline the suggestions inside the other app.
  useEffect(() => {
    setUnderlines(a.issues.map((i) => ({ id: i.id, start: i.start, len: i.end - i.start, category: i.category })));
  }, [a.issues]);

  // The caret moved onto an underlined word: open the card right there, like clicking an underline.
  useEffect(
    () => {
      const show = ([id, r]: [string, [number, number, number, number] | null]) => {
        setFocusId(id);
        open("word", false, r ? { x: r[0], y: r[1], w: r[2], h: r[3] } : undefined);
      };
      const offs = [
        onAppEvent<[string, [number, number, number, number] | null]>("matra://caret-issue", show),
        onAppEvent<[string, [number, number, number, number] | null]>("matra://hover-issue", show),
      ];
      return () => offs.forEach((off) => off());
    },
    // Caret on, or mouse resting on, an underlined word: the small card for that word, right under it.
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
          // A snippet trigger typed in the other app: put the snippet in place.
          const snippets = settingsRef.current.snippets;
          if (snippets.length && f.sel_start != null) {
            const hit = expandSnippet(f.text, f.sel_start, snippets);
            if (hit) writeField(hit.value).then(() => setCaret(hit.caret));
          }
        }
        return f;
      });
      followSelection(f);
    };
    /** Text selected in the other app for a moment: offer the rewrite pill right above it. */
    const followSelection = (f: FieldInfo) => {
      const len = f.sel_len ?? 0;
      const key = `${f.field_id}:${f.sel_start}:${len}`;
      if (key === selKey.current) return;
      selKey.current = key;
      clearTimeout(selTimer.current);
      if (!settingsRef.current.selectionActions || len < 3 || f.sel_start == null || !f.sel_rect) return;
      const start = f.sel_start;
      const rect = f.sel_rect;
      selTimer.current = setTimeout(() => {
        const picked = f.text.slice(start, start + len);
        if (!picked.trim()) return;
        setSelection({ start, len, text: picked });
        setMode("card");
        setShown(true);
        anchor.current = { x: rect[0], y: rect[1], w: rect[2], h: rect[3] };
        showPanel(false, "card", undefined, anchor.current);
      }, 700);
    };
    currentField().then((f) => f && apply(f));
    const offs = [
      onAppEvent<FieldInfo>("matra://field", apply),
      onAppEvent("matra://field-cleared", () => {
        sendBadge({ status: "idle" });
        setBadge(false);
      }),
      onAppEvent<PanelMode | "write" | "corrections" | "improvements" | "ai" | "turnoff">("matra://mode", (m) => {
        setExtra(null);
        if (m === "ai" || m === "turnoff") {
          setSelection(null);
          setExtra(m);
          open("card", true);
        } else if (m === "corrections" || m === "improvements") {
          setGroup(m);
          open("card", true);
        } else if (m === "write") {
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
    else if (status === "done") {
      const corrections = a.issues.filter((i) => i.category === "correctness").length;
      sendBadge(
        a.issues.length
          ? { status: "issues", count: a.issues.length, corrections, improvements: a.issues.length - corrections }
          : { status: "clean" },
      );
    }
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

  if (mode === "card" && extra === "turnoff") {
    const app = field?.app ?? "this app";
    return (
      <SmallCard onResize={(h) => showPanel(false, "card", h, anchor.current)} label={`Turn off Matra for ${app}`}>
        <div className="turnoff">
          <button className="icon-btn turnoff-x" aria-label="Close" onClick={() => { setExtra(null); close(); }}><IconX /></button>
          <h2>Turn off Matra for {app}?</h2>
          <button className="btn btn-primary btn-block" onClick={() => { pauseApp(app); setExtra(null); setShown(false); }}>
            Yes, for this session
          </button>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              setSettings({ ...settings, ignoredApps: [...new Set([...settings.ignoredApps, app])] });
              setExtra(null);
              close();
            }}
          >
            Yes, from now on
          </button>
          <button className="btn btn-block turnoff-no" onClick={() => { setExtra(null); close(); }}>
            No, don't turn it off
          </button>
        </div>
      </SmallCard>
    );
  }

  if (mode === "card" && extra === "ai") {
    return (
      <AICard
        hasText={!!text.trim()}
        voiceSet={!!settings.voice.profile}
        onSetVoice={() => openMain(true, "voice")}
        onRun={(prompt, on, signal) =>
          prompt.kind === "rewrite"
            ? streamRewrite(apiKey, { text, mode: prompt.mode, goals, settings }, on, signal)
            : streamCompose(apiKey, { prompt: prompt.text, context: text, goals, settings }, on, signal)
        }
        onInsert={(out) => {
          const at = field?.sel_start ?? text.length;
          const before = text.slice(0, at);
          const gap = before && !/\s$/.test(before) ? " " : "";
          writeField(before + gap + out + text.slice(at)).then(() => setCaret(at + gap.length + out.length));
          setExtra(null);
          close();
        }}
        onReplace={(out) => {
          writeField(out);
          setExtra(null);
          close();
        }}
        onClose={() => {
          setExtra(null);
          close();
        }}
        onResize={(h) => showPanel(false, "card", h, anchor.current)}
      />
    );
  }

  if (mode === "word") {
    const issue = a.issues.find((i) => i.id === focusId) ?? (!inApp ? a.issues[0] : undefined);
    return (
      <WordCard
        issue={issue}
        onAccept={(replacement) => {
          if (!issue) return;
          a.accept(issue.id, replacement);
          focusSource();
          close();
        }}
        onDismiss={() => {
          if (issue) a.dismiss(issue.id);
          close();
        }}
        onAddWord={() => issue && a.addWord(issue.id)}
        onMute={() => issue && a.mute(issue.id)}
        onReport={() => issue && a.report(issue.id)}
        onSeeMore={() => {
          setGroup("all");
          open("card", true, anchor.current);
        }}
        onResize={(h) => showPanel(false, "word", h, anchor.current)}
      />
    );
  }

  if (mode === "card" && selection) {
    return (
      <SelectionCard
        selected={selection.text}
        onRun={(m, custom, on, signal) =>
          streamRewrite(apiKey, { text: selection.text, mode: m, custom, goals, settings }, on, signal)
        }
        onReplace={(out) => {
          const full = textRef.current;
          const next = full.slice(0, selection.start) + out + full.slice(selection.start + selection.len);
          writeField(next).then(() => setCaret(selection.start + out.length));
          setSelection(null);
          close();
        }}
        onClose={() => {
          setSelection(null);
          close();
        }}
        onResize={(h) => showPanel(false, "card", h, anchor.current)}
      />
    );
  }

  if (mode === "card") {
    return (
      <SuggestionCard
        app={field?.app ?? "this app"}
        empty={!text.trim()}
        group={group}
        onGroup={setGroup}
        issues={
          group === "corrections"
            ? a.issues.filter((i) => i.category === "correctness")
            : group === "improvements"
              ? a.issues.filter((i) => i.category !== "correctness")
              : a.issues
        }
        allCount={a.issues.length}
        hasKey={!!apiKey}
        onAccept={(id, replacement) => {
          a.accept(id, replacement);
          focusSource();
        }}
        onDismiss={a.dismiss}
        onAddWord={a.addWord}
        onMute={a.mute}
        onReport={a.report}
        sentenceCount={a.sentenceCount}
        onFixSentence={(id) => {
          a.fixSentence(id);
          focusSource();
        }}
        onExpand={() => {
          if (!a.issues.length) a.setTab("write");
          open("full", true);
        }}
        onClose={() => {
          setGroup("all");
          close();
        }}
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
            onSelectionAction={a.rewrite}
            snippets={settings.snippets}
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
        onMute={a.mute}
        onReport={a.report}
        onAcceptAll={a.acceptAll}
        sentenceCount={a.sentenceCount}
        onFixSentence={a.fixSentence}
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
        onRegenerate={a.regenerate}
        agents={{ text, goals, settings, apiKey }}
        compact
      />


    </div>
  );
}

/** One suggestion at a time, small, next to the field — the card that opens by itself. */
function SuggestionCard(p: {
  app: string;
  empty: boolean;
  group: "all" | "corrections" | "improvements";
  onGroup(g: "all" | "corrections" | "improvements"): void;
  allCount: number;
  issues: Issue[];
  hasKey: boolean;
  onAccept(id: string, replacement?: string): void;
  onDismiss(id: string): void;
  onAddWord(id: string): void;
  onMute(id: string): void;
  onReport(id: string): void;
  sentenceCount(id: string): number;
  onFixSentence(id: string): void;
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
          {issue
            ? `${p.issues.length} ${
                p.group === "corrections"
                  ? p.issues.length === 1 ? "correction" : "corrections"
                  : p.group === "improvements"
                    ? p.issues.length === 1 ? "improvement" : "improvements"
                    : p.issues.length === 1 ? "suggestion" : "suggestions"
              }`
            : ""}
        </span>
        {p.issues.length > 1 && (
          <span className="sugg-nav">
            <button className="icon-btn" aria-label="Previous suggestion" onClick={() => setIndex((i - 1 + p.issues.length) % p.issues.length)}>
              <IconChevron size={14} dir="left" />
            </button>
            <span className="muted small">{i + 1}/{p.issues.length}</span>
            <button className="icon-btn" aria-label="Next suggestion" onClick={() => setIndex((i + 1) % p.issues.length)}>
              <IconChevron size={14} dir="right" />
            </button>
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
            <span className="diff-arrow" aria-hidden="true"><IconArrowRight size={14} /></span>
            <button className={`sugg-chip sugg-chip-${issue.category}`} onClick={() => p.onAccept(issue.id)} title="Accept">
              {issue.replacement || "(remove)"}
            </button>
            {issue.alternatives?.map((alt) => (
              <button key={alt} className="alt-chip" onClick={() => p.onAccept(issue.id, alt)} title="Use this instead">
                {alt}
              </button>
            ))}
          </div>
          <p className="sugg-why">{issue.explanation}</p>
          <div className="sugg-actions">
            <button className="btn btn-primary btn-sm" onClick={() => p.onAccept(issue.id)}>Accept</button>
            <button className="btn btn-quiet btn-sm" onClick={() => p.onDismiss(issue.id)}>Dismiss</button>
            {p.sentenceCount(issue.id) > 1 && (
              <button className="btn btn-quiet btn-sm" onClick={() => p.onFixSentence(issue.id)}>
                Fix all {p.sentenceCount(issue.id)}
              </button>
            )}
            <IssueMenu issue={issue} onAddWord={p.onAddWord} onMute={p.onMute} onReport={p.onReport} />
          </div>
        </div>
      ) : p.group !== "all" && p.allCount > 0 ? (
        <div className="sugg-hero">
          <span className="sugg-ok" aria-hidden="true">
            <IconCheck size={18} />
          </span>
          <strong>{p.group === "corrections" ? "No corrections left" : "No improvements left"}</strong>
          <button className="btn btn-quiet btn-sm" onClick={() => p.onGroup("all")}>
            Show the other {p.allCount}
          </button>
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

/** Rewrite text selected in another app: pick an action, see the result, replace it in place. */
function SelectionCard(p: {
  selected: string;
  onRun(mode: RewriteMode, custom: string | undefined, onText: (s: string) => void, signal: AbortSignal): Promise<string>;
  onReplace(text: string): void;
  onClose(): void;
  onResize(height: number): void;
}) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<[RewriteMode, string | undefined] | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);

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

  const run = async (mode: RewriteMode, custom?: string) => {
    last.current = [mode, custom];
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setError(null);
    setOut("");
    try {
      setOut(await p.onRun(mode, custom, setOut, c.signal));
    } catch (e) {
      if (!c.signal.aborted) setError(friendlyError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sugg sel-card" ref={root} role="dialog" aria-label="Rewrite the selected text">
      {!out && !busy && !error ? (
        <div className="sel-card-pill">
          <SelectionPill x={0} y={0} inline onRun={run} onClose={p.onClose} />
        </div>
      ) : (
        <>
          <header className="sugg-head" data-tauri-drag-region>
            <LogoMark size={16} />
            <span className="sugg-count" data-tauri-drag-region>{busy ? "Writing…" : "Rewrite"}</span>
            <button className="icon-btn" aria-label="Close (Esc)" onClick={p.onClose}><IconX /></button>
          </header>
          <div className="sugg-body">
            {error ? (
              <div className="notice notice-error" role="alert">{error}</div>
            ) : (
              <div className={`writer-output sel-out${busy ? " is-streaming" : ""}`} aria-live="polite">{out}</div>
            )}
            {!busy && (
              <div className="sugg-actions">
                {out && <button className="btn btn-primary btn-sm" onClick={() => p.onReplace(out)}><IconCheck size={14} /> Replace</button>}
                {last.current && (
                  <button className="btn btn-quiet btn-sm" onClick={() => last.current && run(...last.current)}>Regenerate</button>
                )}
                <button className="btn btn-quiet btn-sm" onClick={p.onClose}>Cancel</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The small card for one underlined word, like Grammarly's: the fix with the changed part
 * highlighted (click it to apply), Dismiss, and a way into the full list. */
function WordCard(p: {
  issue: Issue | undefined;
  onAccept(replacement?: string): void;
  onDismiss(): void;
  onAddWord(): void;
  onMute(): void;
  onReport(): void;
  onSeeMore(): void;
  onResize(height: number): void;
}) {
  const root = useRef<HTMLDivElement>(null);
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
    const esc = (e: KeyboardEvent) => e.key === "Escape" && p.onDismiss();
    window.addEventListener("keydown", esc);
    return () => {
      document.documentElement.classList.remove("is-card");
      window.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const i = p.issue;
  return (
    <div className="word-card" ref={root} role="dialog" aria-label="Suggestion">
      {i ? (
        <>
          <div className="word-kind">
            <i className={`dot dot-${i.category}`} aria-hidden="true" />
            {i.title}
          </div>
          <button className={`word-fix word-fix-${i.category}`} onClick={() => p.onAccept()} title="Apply this fix">
            {i.replacement ? (
              changedParts(i.original, i.replacement).map((part, n) =>
                part.changed ? <mark key={n}>{part.text}</mark> : <span key={n}>{part.text}</span>,
              )
            ) : (
              <span>
                Remove <del>{i.original}</del>
              </span>
            )}
          </button>
          {i.alternatives && i.alternatives.length > 0 && (
            <div className="word-alts">
              {i.alternatives.map((alt) => (
                <button key={alt} className="alt-chip" onClick={() => p.onAccept(alt)}>{alt}</button>
              ))}
            </div>
          )}
          {i.explanation && <p className="word-why">{i.explanation}</p>}
          <div className="word-rows">
            <button className="word-row" onClick={p.onDismiss}>
              <IconTrash size={16} /> Dismiss
            </button>
            <button className="word-row" onClick={p.onSeeMore}>
              <LogoMark size={16} /> See more in Matra
            </button>
          </div>
        </>
      ) : (
        <p className="word-why">This suggestion was already handled.</p>
      )}
    </div>
  );
}

/** A small floating card that sizes its window to its content. */
function SmallCard({ children, onResize, label }: { children: React.ReactNode; onResize(h: number): void; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () => onResize(Math.ceil(el.getBoundingClientRect().height));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    document.documentElement.classList.add("is-card");
    return () => {
      ro.disconnect();
      document.documentElement.classList.remove("is-card");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="sugg small-card" ref={root} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

type AIPrompt = { kind: "rewrite"; mode: RewriteMode; label: string } | { kind: "compose"; text: string; label: string };

/** The bulb's card: set your voice, ideas to start from, or say what to write. */
function AICard(p: {
  hasText: boolean;
  voiceSet: boolean;
  onSetVoice(): void;
  onRun(prompt: AIPrompt, onText: (s: string) => void, signal: AbortSignal): Promise<string>;
  onInsert(text: string): void;
  onReplace(text: string): void;
  onClose(): void;
  onResize(h: number): void;
}) {
  const [ask, setAsk] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<AIPrompt | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const ideas: AIPrompt[] = p.hasText
    ? [
        { kind: "rewrite", mode: "improve", label: "Improve it" },
        { kind: "rewrite", mode: "shorten", label: "Make it shorter" },
        { kind: "rewrite", mode: "formal", label: "Make it more formal" },
        { kind: "rewrite", mode: "to_bangla", label: "Translate to Bangla" },
      ]
    : [
        { kind: "compose", text: "Write a short, polite reply that thanks them and confirms the next step.", label: "Draft a polite reply" },
        { kind: "compose", text: "Write a short progress update for my team: what's done, what's next, any blockers.", label: "Write a project progress update" },
        { kind: "compose", text: "Give me five ideas for a short post, one line each.", label: "Generate ideas for a post" },
      ];

  const run = async (prompt: AIPrompt) => {
    last.current = prompt;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setError(null);
    setOut("");
    try {
      setOut(await p.onRun(prompt, setOut, c.signal));
    } catch (e) {
      if (!c.signal.aborted) setError(friendlyError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SmallCard onResize={p.onResize} label="Write with AI">
      <header className="sugg-head" data-tauri-drag-region>
        <LogoMark size={18} />
        <span className="sugg-count" data-tauri-drag-region />
        <button className="icon-btn" aria-label="Close (Esc)" onClick={p.onClose}><IconX /></button>
      </header>
      {out || busy || error ? (
        <div className="sugg-body">
          <div className="ai-label">{last.current?.label}</div>
          {error ? (
            <div className="notice notice-error" role="alert">{error}</div>
          ) : (
            <div className={`writer-output sel-out${busy ? " is-streaming" : ""}`} aria-live="polite">{out}</div>
          )}
          {!busy && (
            <div className="sugg-actions">
              {out && p.hasText && last.current?.kind === "rewrite" ? (
                <button className="btn btn-primary btn-sm" onClick={() => p.onReplace(out)}><IconCheck size={14} /> Replace</button>
              ) : out ? (
                <button className="btn btn-primary btn-sm" onClick={() => p.onInsert(out)}><IconCheck size={14} /> Insert</button>
              ) : null}
              {last.current && <button className="btn btn-quiet btn-sm" onClick={() => last.current && run(last.current)}>Regenerate</button>}
              <button className="btn btn-quiet btn-sm" onClick={() => { setOut(""); setError(null); last.current = null; }}>Back</button>
            </div>
          )}
        </div>
      ) : (
        <>
          {!p.voiceSet && (
            <div className="ai-voice">
              <strong>Set your voice</strong>
              <span>Choose how you want generated text to sound.</span>
              <button className="btn btn-sm ai-voice-btn" onClick={p.onSetVoice}>Set voice</button>
            </div>
          )}
          <div className="ai-start">
            <h2>How do you want to get started?</h2>
            <p>Here are some ideas</p>
            <ul>
              {ideas.map((idea) => (
                <li key={idea.label}>
                  <button onClick={() => run(idea)}>
                    <IconSpark size={15} /> {idea.label}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="ai-ask"
              onSubmit={(e) => {
                e.preventDefault();
                if (ask.trim()) run({ kind: "compose", text: ask.trim(), label: ask.trim() });
              }}
            >
              <input
                autoFocus
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder={p.hasText ? "Tell Matra what to do with your text…" : "Tell Matra what to write…"}
                aria-label="Tell Matra what to write"
              />
            </form>
          </div>
        </>
      )}
    </SmallCard>
  );
}
