import { useEffect, useState } from "react";
import {
  accessibilityStatus,
  autostart,
  currentField,
  openAccessibilitySettings,
  resetAccessibility,
  type FieldInfo,
} from "../lib/everywhere";
import { inApp, useApiKey } from "../lib/platform";
import { listGoogleModels } from "../lib/providers/google";
import { ANTHROPIC_MODELS, DEFAULT_GOOGLE_MODEL, PROVIDERS, type Provider, type Settings } from "../lib/types";
import { checkForUpdate, currentVersion, installUpdate, type UpdateState } from "../lib/updater";
import { IconAI, IconApps, IconCheck, IconDictionary, IconGeneral, IconSnippets, IconStyle, IconUpdates, IconVoice, IconX } from "./Icons";
import { learnVoice } from "../lib/agents";
import { friendlyError } from "../lib/ai";

/** Browser preview only (?previewApp): show the Mac-app-only rows so they can be reviewed. */
const showAppRows = inApp || (typeof location !== "undefined" && new URLSearchParams(location.search).has("previewApp"));

export type SettingsSection = "general" | "ai" | "apps" | "voice" | "dictionary" | "style" | "snippets" | "updates";

const SECTIONS: { id: SettingsSection; label: string; hint: string; Icon: (p: { size?: number }) => React.ReactElement; tint: string }[] = [
  { id: "general", label: "General", hint: "How and when Matra checks your writing.", Icon: IconGeneral, tint: "slate" },
  { id: "ai", label: "AI provider", hint: "Choose Gemini or Claude, add your key, pick a model.", Icon: IconAI, tint: "pink" },
  { id: "apps", label: "Other apps", hint: "Matra in Mail, Slack, Chrome and every other app.", Icon: IconApps, tint: "indigo" },
  { id: "voice", label: "Your voice", hint: "Matra learns how you write and rewrites in your style.", Icon: IconVoice, tint: "orange" },
  { id: "dictionary", label: "Dictionary", hint: "Words Matra should accept, and suggestions you turned off.", Icon: IconDictionary, tint: "teal" },
  { id: "style", label: "Style guide", hint: "Your own rules, checked in every app.", Icon: IconStyle, tint: "amber" },
  { id: "snippets", label: "Snippets", hint: "Text you type often, inserted with a short trigger.", Icon: IconSnippets, tint: "violet" },
  { id: "updates", label: "Updates", hint: "Your version, new releases and diagnostics.", Icon: IconUpdates, tint: "blue" },
];

export interface SettingsProps {
  section: SettingsSection;
  onSection(s: SettingsSection): void;
  onClose(): void;
  settings: Settings;
  onSettings(s: Settings): void;
  onSaveKey(provider: Provider, key: string): Promise<void>;
  onClearKey(provider: Provider): Promise<void>;
  update: UpdateState;
  onUpdate(s: UpdateState): void;
}

/** Settings as its own page with a section list, like macOS System Settings. */
export function SettingsView(p: SettingsProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.onClose]);

  const current = SECTIONS.find((s) => s.id === p.section)!;

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`settings-tab${s.id === p.section ? " is-active" : ""}`}
            aria-current={s.id === p.section ? "page" : undefined}
            onClick={() => p.onSection(s.id)}
          >
            <span className={`tile tile-${s.tint}`} aria-hidden="true">
              <s.Icon size={15} />
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      <section className="settings-page" aria-labelledby="settings-heading">
        <header className="settings-head">
          <div>
            <h1 id="settings-heading">{current.label}</h1>
            <p className="settings-sub">{current.hint}</p>
          </div>
          <button className="btn btn-quiet btn-sm" onClick={p.onClose}>
            Done
          </button>
        </header>
        {p.section === "general" && <General {...p} />}
        {p.section === "ai" && <AIProvider {...p} />}
        {p.section === "apps" && <OtherApps {...p} />}
        {p.section === "voice" && <Voice {...p} />}
        {p.section === "dictionary" && <Dictionary {...p} />}
        {p.section === "style" && <StyleGuide {...p} />}
        {p.section === "snippets" && <Snippets {...p} />}
        {p.section === "updates" && <Updates {...p} />}
      </section>
    </div>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <div className="srow-text">
        <span className="srow-label">{label}</span>
        {detail && <span className="srow-detail">{detail}</span>}
      </div>
      <div className="srow-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function General({ settings, onSettings }: SettingsProps) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onSettings({ ...settings, [k]: v });
  const [atLogin, setAtLogin] = useState<boolean | null>(null);
  useEffect(() => {
    if (inApp) autostart.isEnabled().then(setAtLogin).catch(() => setAtLogin(null));
  }, []);
  return (
    <div className="sgroup">
      <Row label="Check as I type" detail="Matra checks your text whenever you pause.">
        <Switch label="Check as I type" checked={settings.autoCheck} onChange={(v) => set("autoCheck", v)} />
      </Row>
      <Row label="English spelling">
        <select value={settings.englishDialect} onChange={(e) => set("englishDialect", e.target.value as Settings["englishDialect"])}>
          <option value="US">American (color)</option>
          <option value="UK">British (colour)</option>
        </select>
      </Row>
      <Row label="Underline style" detail="Patterns tell categories apart without relying on color.">
        <select value={settings.underlineStyle} onChange={(e) => set("underlineStyle", e.target.value as Settings["underlineStyle"])}>
          <option value="color">Color only</option>
          <option value="patterns">Color and pattern</option>
        </select>
      </Row>
      <Row label="Explain suggestions in">
        <select
          value={settings.explanationLanguage}
          onChange={(e) => set("explanationLanguage", e.target.value as Settings["explanationLanguage"])}
        >
          <option value="auto">The language I'm writing in</option>
          <option value="en">English</option>
          <option value="bn">Bangla</option>
        </select>
      </Row>
      {inApp && atLogin !== null && (
        <Row label="Start Matra when I log in" detail="So it's ready in every app from the start.">
          <Switch
            label="Start Matra when I log in"
            checked={atLogin}
            onChange={async (on) => {
              await (on ? autostart.enable() : autostart.disable());
              setAtLogin(await autostart.isEnabled());
            }}
          />
        </Row>
      )}
    </div>
  );
}

export function AIProvider(p: SettingsProps) {
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
      <div className="provider-choice" role="radiogroup" aria-label="AI provider">
        {PROVIDERS.map((x) => (
          <button
            key={x.id}
            role="radio"
            aria-checked={p.settings.provider === x.id}
            className={`provider${p.settings.provider === x.id ? " is-on" : ""}`}
            onClick={() => p.onSettings({ ...p.settings, provider: x.id })}
          >
            <strong>{x.label}</strong>
            <span>{x.keyHint}</span>
          </button>
        ))}
      </div>
      <div className="sgroup">
        <Row label={`${provider.label} key`} detail={apiKey ? "Saved in your Mac's Keychain." : `Get one at ${provider.keyUrl}`}>
          {apiKey ? (
            <span className="key-saved">
              <span className="status-dot is-ok" aria-hidden="true" /> {provider.label} key saved
              <button className="btn btn-quiet btn-sm" onClick={() => p.onClearKey(provider.id)}>Remove</button>
            </span>
          ) : (
            <form
              className="inline-form key-form"
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
        </Row>
        <Row label="Model">
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
        </Row>
      </div>
      <p className="snote">
        Your text is sent to {provider.label} to be checked. Google's free tier may use it to improve its products; add
        private apps to “Don't check in” under Other apps.
      </p>
    </>
  );
}

/** Accessibility permission: what it's for, its state, and how to fix a stale entry. */
export function usePermission() {
  const [trusted, setTrusted] = useState<boolean | null>(inApp ? null : false);
  useEffect(() => {
    if (!inApp) return;
    const refresh = () => accessibilityStatus(false).then(setTrusted);
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);
  return trusted;
}

export function OtherApps({ settings, onSettings }: SettingsProps) {
  const trusted = usePermission();
  const [ignored, setIgnored] = useState(settings.ignoredApps.join(", "));
  const [repairing, setRepairing] = useState(false);

  return (
    <>
      {showAppRows && trusted === false && (
        <div className="permission" role="region" aria-label="Accessibility permission">
          <h2>Allow Matra to help in other apps</h2>
          <p>
            macOS asks you to allow Accessibility so Matra can read the text box you're typing in and put fixes back.
            Password fields are never read.
          </p>
          <ol>
            <li>Click <strong>Allow access</strong> and turn on <strong>Matra</strong> in the list that opens.</li>
            <li>
              Already on, but this message stays? That switch belongs to an older Matra. Click <strong>Repair</strong>, then
              turn Matra on again.
            </li>
          </ol>
          <div className="permission-actions">
            <button
              className="btn btn-primary"
              onClick={() => accessibilityStatus(true).then((ok) => !ok && openAccessibilitySettings())}
            >
              Allow access
            </button>
            <button
              className="btn btn-quiet"
              disabled={repairing}
              onClick={async () => {
                setRepairing(true);
                try {
                  await resetAccessibility();
                } finally {
                  setRepairing(false);
                }
              }}
            >
              {repairing ? "Repairing…" : "Repair"}
            </button>
          </div>
        </div>
      )}
      <div className="sgroup">
        <Row label="Check my writing in other apps" detail="Mail, Slack, Chrome, Notes — any text box.">
          <Switch label="Check my writing in other apps" checked={settings.everywhere} onChange={(v) => onSettings({ ...settings, everywhere: v })} />
        </Row>
        <Row label="Open suggestions by themselves" detail="A small card appears next to the text when Matra finds a mistake.">
          <Switch
            label="Open suggestions by themselves"
            disabled={!settings.everywhere}
            checked={settings.autoOpenPanel}
            onChange={(v) => onSettings({ ...settings, autoOpenPanel: v })}
          />
        </Row>
        {showAppRows && (
          <Row label="Accessibility access">
            <span className="perm-state">
              <span className={`status-dot${trusted ? " is-ok" : " is-warn"}`} aria-hidden="true" />
              {trusted === null ? "Checking…" : trusted ? "Allowed" : "Not allowed yet"}
            </span>
          </Row>
        )}
        <Row label="Don't check in" detail="App names, separated by commas.">
          <input
            className="field-input"
            value={ignored}
            placeholder="e.g. Terminal, Xcode"
            onChange={(e) => setIgnored(e.target.value)}
            onBlur={() => onSettings({ ...settings, ignoredApps: ignored.split(",").map((s) => s.trim()).filter(Boolean) })}
            aria-label="Apps where Matra should not check"
          />
        </Row>
        <Row label="Badge position" detail="Drag the badge anywhere on a text box; Matra remembers it for that app.">
          <button
            className="btn btn-quiet btn-sm"
            disabled={Object.keys(settings.badgeOffsets).length === 0}
            onClick={() => onSettings({ ...settings, badgeOffsets: {} })}
          >
            Reset positions
          </button>
        </Row>
        <Row label="Shortcut" detail="Opens Matra for the text you're in, or for the selected text.">
          <kbd className="kbd">⌃⌥M</kbd>
        </Row>
      </div>
    </>
  );
}

function Chips({ items, onRemove, label }: { items: string[]; onRemove(x: string): void; label: string }) {
  return (
    <ul className="word-list" aria-label={label}>
      {items.map((w) => (
        <li key={w}>
          {w}
          <button className="icon-btn" aria-label={`Remove ${w}`} onClick={() => onRemove(w)}>
            <IconX size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Voice({ settings, onSettings }: SettingsProps) {
  const [apiKey] = useApiKey(settings.provider);
  const [samples, setSamples] = useState(settings.voice.samples);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enough = samples.trim().split(/\s+/).length >= 80;
  const v = settings.voice;
  return (
    <>
      <div className="sgroup">
        <div className="sblock">
          <h2>Teach Matra your voice</h2>
          <p className="srow-detail">
            Paste two or three things you wrote yourself — emails, posts, messages — about 80 words or more. Matra describes
            your style and uses it when it rewrites or writes for you.
          </p>
          <textarea
            className="rules"
            rows={8}
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="Paste your own writing here…"
            aria-label="Your writing samples"
          />
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <div className="sblock-actions">
            {!enough && <span className="srow-detail">{Math.max(0, 80 - samples.trim().split(/\s+/).filter(Boolean).length)} more words needed</span>}
            <button
              className="btn btn-primary btn-sm"
              disabled={!enough || busy || !apiKey}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const r = await learnVoice(apiKey, samples, settings);
                  onSettings({ ...settings, voice: { samples, profile: r.profile, traits: r.traits.slice(0, 6), enabled: true } });
                } catch (e) {
                  setError(friendlyError(e).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Learning…" : v.profile ? "Learn again" : "Learn my voice"}
            </button>
          </div>
        </div>
      </div>
      {v.profile && (
        <div className="sgroup">
          <Row label="Write in my voice" detail="Rewrites, translations and Write with AI follow your style.">
            <Switch label="Write in my voice" checked={v.enabled} onChange={(on) => onSettings({ ...settings, voice: { ...v, enabled: on } })} />
          </Row>
          <div className="sblock">
            <h2>How you write</h2>
            <div className="tones">
              {v.traits.map((t) => (
                <span key={t} className="tone">{t}</span>
              ))}
            </div>
            <p className="notes">{v.profile}</p>
          </div>
        </div>
      )}
    </>
  );
}

function Dictionary({ settings, onSettings }: SettingsProps) {
  const [word, setWord] = useState("");
  const add = () => {
    const w = word.trim();
    if (!w) return;
    onSettings({ ...settings, dictionary: [...new Set([...settings.dictionary, w])] });
    setWord("");
  };
  return (
    <>
      <div className="sgroup">
        <div className="sblock">
          <h2>Your words</h2>
          <p className="srow-detail">Names, brands and jargon Matra should never mark as misspelled.</p>
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
          {settings.dictionary.length > 0 ? (
            <Chips
              label="Dictionary words"
              items={settings.dictionary}
              onRemove={(w) => onSettings({ ...settings, dictionary: settings.dictionary.filter((x) => x !== w) })}
            />
          ) : (
            <p className="snote">No words yet. Use “Add to dictionary” in a suggestion's ⋯ menu, or add them here.</p>
          )}
        </div>
      </div>
      <div className="sgroup">
        <div className="sblock">
          <h2>Turned-off suggestions</h2>
          <p className="srow-detail">Kinds of suggestions you turned off from a suggestion's ⋯ menu.</p>
          {settings.mutedKinds.length > 0 ? (
            <Chips
              label="Turned-off suggestion kinds"
              items={settings.mutedKinds}
              onRemove={(k) => onSettings({ ...settings, mutedKinds: settings.mutedKinds.filter((x) => x !== k) })}
            />
          ) : (
            <p className="snote">Nothing turned off.</p>
          )}
        </div>
      </div>
    </>
  );
}

function StyleGuide({ settings, onSettings }: SettingsProps) {
  const [rules, setRules] = useState(settings.styleRules);
  const dirty = rules !== settings.styleRules;
  return (
    <div className="sgroup">
      <div className="sblock">
        <h2>Your rules</h2>
        <p className="srow-detail">One rule per line. Matra flags text that breaks them, in this app and in every other app.</p>
        <textarea
          className="rules"
          rows={8}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder={"Write “email”, not “e-mail”\nUse “customer”, never “client”\nNo exclamation marks in work emails"}
          aria-label="Style guide rules"
        />
        <div className="sblock-actions">
          <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={() => onSettings({ ...settings, styleRules: rules })}>
            {dirty ? "Save rules" : <><IconCheck size={14} /> Saved</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Snippets({ settings, onSettings }: SettingsProps) {
  const [trigger, setTrigger] = useState(";");
  const [text, setText] = useState("");
  const taken = settings.snippets.some((s) => s.trigger === trigger.trim());
  const valid = trigger.trim().length >= 2 && !/\s/.test(trigger.trim()) && text.trim() && !taken;
  return (
    <>
      <div className="sgroup">
        <div className="sblock">
          <h2>New snippet</h2>
          <p className="srow-detail">Type the trigger and a space in Matra's editor or the floating panel, and Matra puts the text in.</p>
          <form
            className="snippet-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              onSettings({ ...settings, snippets: [...settings.snippets, { trigger: trigger.trim(), text }] });
              setTrigger(";");
              setText("");
            }}
          >
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="Trigger" placeholder=";sig" className="snippet-trigger" />
            <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Snippet text" placeholder={"Best regards,\nYour name"} rows={3} className="rules" />
            <div className="sblock-actions">
              {taken && <span className="srow-detail">That trigger is already used.</span>}
              <button className="btn btn-primary btn-sm" disabled={!valid}>Add snippet</button>
            </div>
          </form>
        </div>
      </div>
      {settings.snippets.length > 0 ? (
        <div className="sgroup">
          {settings.snippets.map((s) => (
            <div className="srow" key={s.trigger}>
              <div className="srow-text">
                <span className="srow-label"><kbd className="kbd">{s.trigger}</kbd></span>
                <span className="srow-detail snippet-preview">{s.text}</span>
              </div>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => onSettings({ ...settings, snippets: settings.snippets.filter((x) => x.trigger !== s.trigger) })}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="snote">No snippets yet. A common first one: “;sig” for your email signature.</p>
      )}
    </>
  );
}

function Updates({ update, onUpdate }: SettingsProps) {
  const [version, setVersion] = useState("…");
  const [field, setField] = useState<FieldInfo | null>(null);
  const trusted = usePermission();
  useEffect(() => {
    currentVersion().then(setVersion).catch(() => setVersion("unknown"));
    const t = setInterval(() => currentField().then(setField), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="sgroup">
        <Row label={`Matra ${version}`} detail={updateLine(update)}>
          <UpdateControl state={update} onUpdate={onUpdate} />
        </Row>
        {update.status === "available" && (
          <div className="sblock">
            <h2>What's new in {update.version}</h2>
            <p className="notes">{update.notes || "Bug fixes and improvements."}</p>
          </div>
        )}
        {update.status === "downloading" && (
          <div className="sblock">
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${update.total ? Math.round((update.downloaded / update.total) * 100) : 30}%` }} />
            </div>
          </div>
        )}
      </div>
      {showAppRows && (
        <div className="sgroup">
          <div className="sblock">
            <h2>Diagnostics</h2>
            <p className="srow-detail">If something doesn't work in another app, these lines help find out why.</p>
          </div>
          <Row label="Accessibility">
            <span className="perm-state">
              <span className={`status-dot${trusted ? " is-ok" : " is-warn"}`} aria-hidden="true" />
              {trusted ? "Allowed" : "Not allowed"}
            </span>
          </Row>
          <Row label="Text box Matra sees" detail="Click into a text box in another app, then look here.">
            <span className="mono-ish">{field ? `${field.app} · ${field.text.length} characters` : "None right now"}</span>
          </Row>
        </div>
      )}
    </>
  );
}

function updateLine(s: UpdateState): string | undefined {
  switch (s.status) {
    case "uptodate":
      return "You're on the latest version.";
    case "checking":
      return "Checking GitHub for a newer version…";
    case "downloading": {
      const pct = s.total ? Math.round((s.downloaded / s.total) * 100) : null;
      return `Downloading ${s.version}${pct !== null ? ` · ${pct}%` : "…"}`;
    }
    case "ready":
      return "Installed. Restarting Matra…";
    case "error":
      return `Update failed: ${s.message}`;
    case "unsupported":
      return "Updates work in the installed Mac app, not in the browser preview.";
    default:
      return "Matra checks for updates when it starts.";
  }
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
