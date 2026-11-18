import { useEffect, useState } from "react";
import { MODELS, type Settings } from "../lib/types";
import { checkForUpdate, currentVersion, installUpdate, type UpdateState } from "../lib/updater";
import { IconX } from "./Icons";

interface Props {
  open: boolean;
  onClose(): void;
  settings: Settings;
  onSettings(s: Settings): void;
  hasKey: boolean;
  onSaveKey(key: string): Promise<void>;
  onClearKey(): Promise<void>;
  update: UpdateState;
  onUpdate(s: UpdateState): void;
}

export function SettingsSheet(p: Props) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState("…");

  useEffect(() => {
    currentVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]);

  if (!p.open) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => p.onSettings({ ...p.settings, [k]: v });

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="sheet-head">
          <h2 id="settings-title">Settings</h2>
          <button className="icon-btn" aria-label="Close settings" onClick={p.onClose}><IconX /></button>
        </header>

        <section className="group">
          <h3>AI connection</h3>
          <p className="muted small">
            Matra uses Claude through your own Anthropic API key. Get one at console.anthropic.com. The key is kept in
            your Mac's Keychain.
          </p>
          {p.hasKey ? (
            <div className="row">
              <span className="status-ok">● Key saved</span>
              <button className="btn btn-quiet btn-sm" onClick={() => p.onClearKey()}>Remove key</button>
            </div>
          ) : (
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!key.trim()) return;
                setSaving(true);
                try {
                  await p.onSaveKey(key.trim());
                  setKey("");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-…"
                aria-label="Anthropic API key"
                autoComplete="off"
              />
              <button className="btn btn-primary" disabled={!key.trim() || saving}>Save</button>
            </form>
          )}
          <label className="field">
            <span>Model</span>
            <select value={p.settings.model} onChange={(e) => set("model", e.target.value)}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="group">
          <h3>Checking</h3>
          <label className="toggle">
            <input type="checkbox" checked={p.settings.autoCheck} onChange={(e) => set("autoCheck", e.target.checked)} />
            <span>Check automatically when I pause typing</span>
          </label>
          <label className="field">
            <span>English spelling</span>
            <select value={p.settings.englishDialect} onChange={(e) => set("englishDialect", e.target.value as Settings["englishDialect"])}>
              <option value="US">American (color, organize)</option>
              <option value="UK">British (colour, organise)</option>
            </select>
          </label>
          <label className="field">
            <span>Explain suggestions in</span>
            <select
              value={p.settings.explanationLanguage}
              onChange={(e) => set("explanationLanguage", e.target.value as Settings["explanationLanguage"])}
            >
              <option value="auto">The language I'm writing in</option>
              <option value="en">English</option>
              <option value="bn">Bangla</option>
            </select>
          </label>
        </section>

        <section className="group">
          <h3>Updates</h3>
          <div className="row">
            <span>Matra <strong>{version}</strong></span>
            <UpdateControl state={p.update} onUpdate={p.onUpdate} />
          </div>
          <UpdateDetail state={p.update} />
        </section>
      </div>
    </div>
  );
}

function UpdateControl({ state, onUpdate }: { state: UpdateState; onUpdate(s: UpdateState): void }) {
  if (state.status === "available") {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => installUpdate(onUpdate)}>
        Update to {state.version}
      </button>
    );
  }
  const busy = state.status === "checking" || state.status === "downloading" || state.status === "ready";
  return (
    <button
      className="btn btn-quiet btn-sm"
      disabled={busy}
      onClick={async () => {
        onUpdate({ status: "checking" });
        onUpdate(await checkForUpdate());
      }}
    >
      {state.status === "checking" ? "Checking…" : "Check for updates"}
    </button>
  );
}

function UpdateDetail({ state }: { state: UpdateState }) {
  switch (state.status) {
    case "uptodate":
      return <p className="muted small">You're on the latest version.</p>;
    case "available":
      return (
        <div className="update-notes">
          <div className="eyebrow">What's new in {state.version}</div>
          <p>{state.notes || "Bug fixes and improvements."}</p>
        </div>
      );
    case "downloading": {
      const pct = state.total ? Math.round((state.downloaded / state.total) * 100) : null;
      return (
        <div className="progress" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${pct ?? 30}%` }} />
          <span className="small muted">Downloading {state.version}{pct !== null ? ` · ${pct}%` : "…"}</span>
        </div>
      );
    }
    case "ready":
      return <p className="muted small">Installed. Restarting Matra…</p>;
    case "error":
      return <p className="notice notice-error small">Update failed: {state.message}</p>;
    case "unsupported":
      return <p className="muted small">Updates work in the installed Mac app, not in the browser preview.</p>;
    default:
      return null;
  }
}
