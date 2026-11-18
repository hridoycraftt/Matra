import { useEffect, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./components/Editor";
import { GoalsMenu } from "./components/GoalsMenu";
import { IconCheck, IconGear, IconX, LogoMark } from "./components/Icons";
import { SidePanel } from "./components/SidePanel";
import {
  configureEverywhere,
  currentField,
  hidePanel,
  openMain,
  sendBadge,
  showPanel,
  writeField,
  type FieldInfo,
} from "./lib/everywhere";
import { inApp, onAppEvent, useApiKey, useSettings } from "./lib/platform";
import { DEFAULT_GOALS, type Goals } from "./lib/types";
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
 * The floating panel that works on text in other apps. It is also Matra's "brain" for
 * other apps: it checks the focused field in the background and drives the badge.
 */
export default function Panel() {
  const [settings] = useSettings();
  const [apiKey] = useApiKey(settings.provider);
  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [field, setField] = useState<FieldInfo | null>(inApp ? null : PREVIEW_FIELD);
  const [text, setText] = useState(inApp ? "" : PREVIEW_FIELD.text);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const editor = useRef<EditorHandle>(null);
  const fromField = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoOpened = useRef<number | null>(null);
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
      }, 250);
    },
    goals,
    settings,
    apiKey,
    editor,
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

  // Follow the text field the user is typing in.
  useEffect(() => {
    const apply = (f: FieldInfo) => {
      setField((prev) => {
        if (!prev || prev.field_id !== f.field_id) {
          a.reset();
          autoOpened.current = null;
          setText(f.text);
        } else if (f.text !== textRef.current) {
          fromField.current = true;
          a.syncText(f.text);
          setText(f.text);
          fromField.current = false;
        }
        return f;
      });
    };
    currentField().then((f) => f && apply(f));
    const off1 = onAppEvent<FieldInfo>("matra://field", apply);
    const off2 = onAppEvent("matra://field-cleared", () => sendBadge({ status: "idle" }));
    return () => {
      off1();
      off2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Badge + automatic opening.
  useEffect(() => {
    if (a.check.status === "checking") sendBadge({ status: "checking" });
    else if (a.check.status === "error") sendBadge({ status: "error" });
    else if (a.check.status === "done") {
      sendBadge(a.issues.length ? { status: "issues", count: a.issues.length } : { status: "clean" });
      if (a.issues.length && settings.autoOpenPanel && field && autoOpened.current !== field.field_id) {
        autoOpened.current = field.field_id;
        showPanel(false);
      }
    } else sendBadge({ status: "idle" });
  }, [a.check.status, a.issues.length, settings.autoOpenPanel, field]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hidePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        <button className="icon-btn" aria-label="Close panel (Esc)" onClick={() => hidePanel()}>
          <IconX />
        </button>
      </header>

      <div className="mini-text">
        {field ? (
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
            Click into any text box in another app and start typing. Matra checks it when you pause. If an app's text
            can't be read, select the text and press ⌃⌥M.
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
        onAcceptAll={a.acceptAll}
        hasKey={!!apiKey}
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
        <button className="btn btn-primary btn-sm" onClick={() => hidePanel()}>
          <IconCheck /> Done
        </button>
      </footer>
    </div>
  );
}
