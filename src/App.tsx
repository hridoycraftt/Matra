import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./components/Editor";
import { GoalsMenu } from "./components/GoalsMenu";
import { IconCheck, IconDoc, IconGear, IconPlus, IconTrash, LogoMark } from "./components/Icons";
import { Onboarding } from "./components/Onboarding";
import { SettingsView, usePermission, type SettingsSection } from "./components/SettingsView";
import { SidePanel } from "./components/SidePanel";
import { clearApiKey, inApp, onAppEvent, saveApiKey, useApiKey, useSettings } from "./lib/platform";
import { computeStats, formatMinutes } from "./lib/stats";
import { docTitle, loadActiveId, loadDocs, newDoc, saveActiveId, saveDocs } from "./lib/storage";
import { PROVIDERS, type MatraDoc } from "./lib/types";
import { useAssistant, useSelectionWords } from "./lib/useAssistant";
import { useUnderlineStyle } from "./lib/useUnderlineStyle";
import { checkForUpdate, type UpdateState } from "./lib/updater";
import { configureEverywhere } from "./lib/everywhere";

export default function App() {
  const [docs, setDocs] = useState<MatraDoc[]>(loadDocs);
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadActiveId();
    const all = loadDocs();
    return saved && all.some((d) => d.id === saved) ? saved : all[0].id;
  });
  const [settings, setSettings] = useSettings();
  const [apiKey] = useApiKey(settings.provider);
  useUnderlineStyle(settings);
  const [section, setSection] = useState<SettingsSection | null>(null);
  const openSettings = (s: SettingsSection = "general") => setSection(s);
  const trusted = usePermission();
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  const editor = useRef<EditorHandle>(null);
  const doc = docs.find((d) => d.id === activeId) ?? docs[0];

  // ---------- persistence ----------
  useEffect(() => saveDocs(docs), [docs]);
  useEffect(() => saveActiveId(activeId), [activeId]);

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

  const a = useAssistant({
    text: doc.text,
    setText: (text) => patchDoc(doc.id, { text }),
    goals: doc.goals,
    settings,
    apiKey,
    editor,
    onAddWord: (w) => setSettings({ ...settings, dictionary: [...new Set([...settings.dictionary, w])] }),
    onMute: (k) => setSettings({ ...settings, mutedKinds: [...new Set([...settings.mutedKinds, k])] }),
    onReject: (r) => setSettings({ ...settings, rejected: [...new Set([...settings.rejected, r])].slice(-300) }),
  });
  const selectionWords = useSelectionWords();

  const openDoc = (id: string) => {
    setSection(null);
    if (id === activeId) return;
    a.reset();
    setActiveId(id);
  };

  const createDoc = () => {
    const d = newDoc();
    setSection(null);
    setDocs((all) => [d, ...all]);
    a.reset();
    setActiveId(d.id);
    requestAnimationFrame(() => editor.current?.focus());
  };

  const deleteDoc = (id: string) => {
    setDocs((all) => {
      const rest = all.filter((d) => d.id !== id);
      const next = rest.length ? rest : [newDoc()];
      if (id === activeId) {
        a.reset();
        setActiveId(next[0].id);
      }
      return next;
    });
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
        openSettings();
      } else if (e.key === "Enter" && document.activeElement?.classList.contains("editor-input")) {
        e.preventDefault();
        a.runCheck();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The menu bar item can ask the main window to open Settings.
  useEffect(() => onAppEvent("matra://open-settings", () => openSettings()), []);
  useEffect(() => {
    configureEverywhere(settings);
  }, [settings]);

  const stats = useMemo(() => computeStats(doc.text), [doc.text]);
  const sorted = useMemo(() => [...docs].sort((a, b) => b.updatedAt - a.updatedAt), [docs]);

  return (
    <div className={`app${inApp ? " in-app" : ""}${section ? " is-settings" : ""}`}>
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
                <span className="doc-icon" aria-hidden="true">
                  <IconDoc size={15} />
                </span>
                <span className="doc-text">
                  <span className="doc-name">{docTitle(d)}</span>
                  <span className="doc-meta">{relativeTime(d.updatedAt)}</span>
                </span>
              </button>
              <button className="icon-btn doc-delete" aria-label={`Delete ${docTitle(d)}`} onClick={() => deleteDoc(d.id)}>
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button
          className="apps-status"
          onClick={() => openSettings("apps")}
          title="Matra in other apps"
        >
          <span
            className={`status-dot${!settings.everywhere || !inApp ? "" : !trusted ? " is-warn" : " is-ok"}`}
            aria-hidden="true"
          />
          <span>
            Other apps:{" "}
            {!settings.everywhere ? "Off" : inApp && !trusted ? "Needs permission" : inApp ? "On" : "Mac app only"}
          </span>
        </button>
        <button
          className={`btn btn-side${section ? " is-active" : ""}`}
          onClick={() => (section ? setSection(null) : openSettings())}
          aria-pressed={!!section}
        >
          <IconGear /> Settings
          {update.status === "available" && <span className="badge">Update</span>}
        </button>
      </nav>

      {!settings.onboarded && (
        <Onboarding
          section="ai"
          onSection={() => undefined}
          onClose={() => undefined}
          settings={settings}
          onSettings={setSettings}
          onSaveKey={async (provider, k) => {
            await saveApiKey(provider, k);
            a.invalidate();
          }}
          onClearKey={(provider) => clearApiKey(provider)}
          update={update}
          onUpdate={setUpdate}
          onFinish={() => setSettings({ ...settings, onboarded: true })}
        />
      )}
      {section ? (
        <SettingsView
          section={section}
          onSection={setSection}
          onClose={() => setSection(null)}
          settings={settings}
          onSettings={setSettings}
          onSaveKey={async (provider, k) => {
            await saveApiKey(provider, k);
            a.invalidate();
          }}
          onClearKey={(provider) => clearApiKey(provider)}
          update={update}
          onUpdate={setUpdate}
        />
      ) : (
      <>
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
                a.setTab("review");
                a.runCheck();
              }}
              disabled={!apiKey || a.check.status === "checking"}
              title="Check now (⌘↩)"
            >
              <IconCheck /> {a.check.status === "checking" ? "Checking…" : "Check"}
            </button>
          </div>
        </header>
        <div className="page-scroll">
          <article className="page">
            <Editor
              ref={editor}
              text={doc.text}
              issues={a.issues}
              activeId={a.activeIssue}
              onChange={a.onTextChange}
              onCaret={a.onCaret}
            onSelectionAction={a.rewrite}
            snippets={settings.snippets}
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
        providerLabel={PROVIDERS.find((x) => x.id === settings.provider)!.label}
        onOpenSettings={() => openSettings("ai")}
        writer={a.writer}
        selectionWords={selectionWords}
        onRewrite={a.rewrite}
        onCompose={a.compose}
        onWriterApply={a.applyWriter}
        onWriterDiscard={a.discardWriter}
        onWriterStop={a.stopWriter}
        onRegenerate={a.regenerate}
        agents={{ text: doc.text, goals: doc.goals, settings, apiKey }}
      />
      </>
      )}
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
