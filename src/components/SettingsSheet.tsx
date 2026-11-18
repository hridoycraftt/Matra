import { useEffect, useState } from "react";
import { listGoogleModels } from "../lib/providers/google";
import { accessibilityStatus, autostart, openAccessibilitySettings } from "../lib/everywhere";
import { inApp, useApiKey } from "../lib/platform";
import { ANTHROPIC_MODELS, DEFAULT_GOOGLE_MODEL, PROVIDERS, type Provider, type Settings } from "../lib/types";
import { checkForUpdate, currentVersion, installUpdate, type UpdateState } from "../lib/updater";
import { IconX } from "./Icons";

interface Props {
  open: boolean;
  onClose(): void;
  settings: Settings;
  onSettings(s: Settings): void;
  onSaveKey(provider: Provider, key: string): Promise<void>;
  onClearKey(provider: Provider): Promise<void>;
  update: UpdateState;
  onUpdate(s: UpdateState): void;
}

export function SettingsSheet(p: Props) {
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
          <h3>AI provider</h3>
          <div className="segmented segmented-wide" role="radiogroup" aria-label="AI provider">
            {PROVIDERS.map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={p.settings.provider === x.id}
                aria-selected={p.settings.provider === x.id}
                onClick={() => set("provider", x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <KeyAndModel {...p} />
        </section>

        <Everywhere settings={p.settings} onSettings={p.onSettings} />

        <DictionaryAndStyle settings={p.settings} onSettings={p.onSettings} />

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

function KeyAndModel(p: Props) {
  const provider = PROVIDERS.find((x) => x.id === p.settings.provider)!;
  const [apiKey] = useApiKey(provider.id);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [googleModels, setGoogleModels] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (provider.id !== "google" || !apiKey) return;
    let alive = true;
    listGoogleModels(apiKey)
      .then((m) => alive && setGoogleModels(m))
      .catch(() => alive && setGoogleModels([]));
    return () => {
      alive = false;
    };
  }, [provider.id, apiKey]);

  const googleOptions = [
    { id: DEFAULT_GOOGLE_MODEL, label: "Latest Gemini Flash (recommended, free)" },
    { id: "gemini-flash-lite-latest", label: "Latest Gemini Flash-Lite (fastest, free)" },
    ...googleModels.filter((m) => m.id !== DEFAULT_GOOGLE_MODEL && m.id !== "gemini-flash-lite-latest"),
  ];
  if (!googleOptions.some((m) => m.id === p.settings.googleModel)) {
    googleOptions.push({ id: p.settings.googleModel, label: p.settings.googleModel });
  }

  return (
    <>
      <p className="muted small">
        {provider.keyHint}: <strong>{provider.keyUrl}</strong>. Keys are kept in your Mac's Keychain.
      </p>
      {apiKey ? (
        <div className="row">
          <span className="status-ok">● {provider.label} key saved</span>
          <button className="btn btn-quiet btn-sm" onClick={() => p.onClearKey(provider.id)}>Remove key</button>
        </div>
      ) : (
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setSaving(true);
            try {
              await p.onSaveKey(provider.id, draft.trim());
              setDraft("");
            } finally {
              setSaving(false);
            }
          }}
        >
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={provider.placeholder}
            aria-label={`${provider.label} API key`}
            autoComplete="off"
          />
          <button className="btn btn-primary" disabled={!draft.trim() || saving}>Save</button>
        </form>
      )}
      <label className="field">
        <span>Model</span>
        {provider.id === "google" ? (
          <select value={p.settings.googleModel} onChange={(e) => p.onSettings({ ...p.settings, googleModel: e.target.value })}>
            {googleOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        ) : (
          <select value={p.settings.anthropicModel} onChange={(e) => p.onSettings({ ...p.settings, anthropicModel: e.target.value })}>
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
            ))}
          </select>
        )}
      </label>
    </>
  );
}

function Everywhere({ settings, onSettings }: { settings: Settings; onSettings(s: Settings): void }) {
  const [trusted, setTrusted] = useState<boolean | null>(null);
  const [atLogin, setAtLogin] = useState<boolean | null>(null);
  const [ignored, setIgnored] = useState(settings.ignoredApps.join(", "));

  useEffect(() => {
    if (!inApp) return;
    const refresh = () => accessibilityStatus(false).then(setTrusted);
    refresh();
    autostart.isEnabled().then(setAtLogin).catch(() => setAtLogin(null));
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="group">
      <h3>Matra in every app</h3>
      <p className="muted small">
        Matra watches the text box you're typing in — in Mail, Slack, Chrome, Notes, anywhere — checks it when you
        pause, and shows a badge with the number of suggestions. Password fields are never read.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.everywhere}
          onChange={(e) => {
            onSettings({ ...settings, everywhere: e.target.checked });
            if (e.target.checked && inApp) accessibilityStatus(true).then(setTrusted);
          }}
        />
        <span>Check my writing in other apps</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.autoOpenPanel}
          disabled={!settings.everywhere}
          onChange={(e) => onSettings({ ...settings, autoOpenPanel: e.target.checked })}
        />
        <span>Open suggestions automatically when Matra finds a mistake</span>
      </label>
      {inApp ? (
        <div className="row">
          {trusted ? (
            <span className="status-ok">● Accessibility access granted</span>
          ) : (
            <span className="status-warn">● Accessibility access needed</span>
          )}
          {!trusted && (
            <button className="btn btn-quiet btn-sm" onClick={() => openAccessibilitySettings()}>
              Open System Settings
            </button>
          )}
        </div>
      ) : (
        <p className="muted small">This works in the installed Mac app. In the preview, try it with <strong>?view=panel</strong>.</p>
      )}
      <label className="field">
        <span>Don't check in</span>
        <input
          className="field-input"
          value={ignored}
          placeholder="e.g. Terminal, Xcode"
          onChange={(e) => setIgnored(e.target.value)}
          onBlur={() =>
            onSettings({
              ...settings,
              ignoredApps: ignored.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
          aria-label="Apps where Matra should not check"
        />
      </label>
      <p className="muted small">
        Drag the Matra badge anywhere on a text box; it stays there for that app.
        {Object.keys(settings.badgeOffsets).length > 0 && (
          <>
            {" "}
            <button className="link-btn" onClick={() => onSettings({ ...settings, badgeOffsets: {} })}>
              Reset badge positions
            </button>
          </>
        )}
      </p>
      <p className="muted small">Shortcut: <kbd>⌃⌥M</kbd> opens Matra for the text you're in, or for the selected text.</p>
      {inApp && atLogin !== null && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={atLogin}
            onChange={async (e) => {
              const on = e.target.checked;
              await (on ? autostart.enable() : autostart.disable());
              setAtLogin(await autostart.isEnabled());
            }}
          />
          <span>Start Matra when I log in</span>
        </label>
      )}
    </section>
  );
}

function DictionaryAndStyle({ settings, onSettings }: { settings: Settings; onSettings(s: Settings): void }) {
  const [word, setWord] = useState("");
  const [rules, setRules] = useState(settings.styleRules);
  const add = () => {
    const w = word.trim();
    if (!w) return;
    onSettings({ ...settings, dictionary: [...new Set([...settings.dictionary, w])] });
    setWord("");
  };
  return (
    <section className="group">
      <h3>Personal dictionary</h3>
      <p className="muted small">Words Matra will never mark as misspelled: names, brands, jargon.</p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add a word" aria-label="Add a word to the dictionary" />
        <button className="btn btn-quiet" disabled={!word.trim()}>Add</button>
      </form>
      {settings.dictionary.length > 0 && (
        <ul className="word-list" aria-label="Dictionary words">
          {settings.dictionary.map((w) => (
            <li key={w}>
              {w}
              <button
                className="icon-btn"
                aria-label={`Remove ${w}`}
                onClick={() => onSettings({ ...settings, dictionary: settings.dictionary.filter((x) => x !== w) })}
              >
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Style guide</h3>
      <p className="muted small">Your own rules, one per line. Matra flags text that breaks them.</p>
      <textarea
        className="rules"
        rows={4}
        value={rules}
        onChange={(e) => setRules(e.target.value)}
        onBlur={() => onSettings({ ...settings, styleRules: rules })}
        placeholder={"Write “email”, not “e-mail”\nUse “customer”, never “client”\nNo exclamation marks in work emails"}
        aria-label="Style guide rules"
      />
    </section>
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
