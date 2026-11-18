import { useMemo, useState } from "react";
import { CATEGORIES, REWRITE_MODES, type Category, type Issue, type RewriteMode } from "../lib/types";
import { IssueMenu } from "./IssueMenu";
import { IconArrowDown, IconCheck, IconCopy, IconSpark, IconX, LogoMark } from "./Icons";

export type CheckStatus = "idle" | "checking" | "done" | "error";

export interface CheckView {
  status: CheckStatus;
  error?: string;
  score?: number;
  toneLabels?: string[];
  toneSummary?: string;
  truncated?: boolean;
}

export interface WriterView {
  kind: "rewrite" | "compose";
  label: string;
  output: string;
  streaming: boolean;
  error?: string;
  hasRange: boolean;
}

interface Props {
  tab: "review" | "write";
  onTab(t: "review" | "write"): void;
  check: CheckView;
  issues: Issue[];
  activeId: string | null;
  onActivate(id: string): void;
  onAccept(id: string, replacement?: string): void;
  onDismiss(id: string): void;
  onAddWord(id: string): void;
  onMute(id: string): void;
  onReport(id: string): void;
  onAcceptAll(category: Category | "all"): void;
  hasKey: boolean;
  providerLabel: string;
  onOpenSettings(): void;
  writer: WriterView | null;
  selectionWords: number;
  onRewrite(mode: RewriteMode, custom?: string): void;
  onCompose(prompt: string): void;
  onWriterApply(how: "replace" | "insert"): void;
  onWriterDiscard(): void;
  onWriterStop(): void;
  onRegenerate?(): void;
  compact?: boolean;
}

export function SidePanel(p: Props) {
  return (
    <aside className={`panel${p.compact ? " panel-compact" : ""}`} aria-label="Matra assistant">
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={p.tab === "review"} onClick={() => p.onTab("review")}>
          Review
          {p.issues.length > 0 && <span className="count">{p.issues.length}</span>}
        </button>
        <button role="tab" aria-selected={p.tab === "write"} onClick={() => p.onTab("write")}>
          Write with AI
        </button>
      </div>
      {!p.hasKey ? (
        <div className="empty">
          <LogoMark />
          <h3>Connect Matra's AI</h3>
          <p>Add your {p.providerLabel} API key once. It is stored in your Mac's Keychain, never in a file.</p>
          <button className="btn btn-primary" onClick={p.onOpenSettings}>
            Open Settings
          </button>
        </div>
      ) : p.tab === "review" ? (
        <Review {...p} />
      ) : (
        <Write {...p} />
      )}
    </aside>
  );
}

function ScoreRing({ score, busy }: { score?: number; busy: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className={`ring${busy ? " is-busy" : ""}`} role="img" aria-label={score === undefined ? "Not scored yet" : `Score ${score} of 100`}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="ring-track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="ring-value"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
        />
      </svg>
      <span className="ring-label">{score ?? "–"}</span>
    </div>
  );
}

function Review(p: Props) {
  const [filter, setFilter] = useState<Category | "all">("all");
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of p.issues) m[i.category] = (m[i.category] ?? 0) + 1;
    return m;
  }, [p.issues]);
  const visible = filter === "all" ? p.issues : p.issues.filter((i) => i.category === filter);
  const busy = p.check.status === "checking";

  return (
    <div className="review">
      <section className="scorecard">
        <ScoreRing score={p.check.score} busy={busy} />
        <div className="scorecard-text">
          <h3 className="panel-h">{busy ? "Checking…" : "Overall score"}</h3>
          {p.check.toneLabels?.length ? (
            <div className="tones">
              {p.check.toneLabels.map((t) => (
                <span key={t} className="tone">{t}</span>
              ))}
            </div>
          ) : (
            <div className="muted small">Tone appears after the first check.</div>
          )}
          {p.check.toneSummary && <p className="tone-summary">{p.check.toneSummary}</p>}
        </div>
      </section>

      {p.check.status === "error" && (
        <div className="notice notice-error" role="alert">{p.check.error}</div>
      )}
      {p.check.truncated && (
        <div className="notice">This document is long, so only the first part was checked.</div>
      )}

      <div className="filters" role="group" aria-label="Filter suggestions">
        <button className={`chip${filter === "all" ? " is-on" : ""}`} onClick={() => setFilter("all")}>
          All <span>{p.issues.length}</span>
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`chip chip-${c.id}${filter === c.id ? " is-on" : ""}`}
            onClick={() => setFilter(c.id)}
            title={c.hint}
          >
            <i className={`dot dot-${c.id}`} aria-hidden="true" />
            {c.label} <span>{counts[c.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length > 1 && (
        <button className="btn btn-quiet btn-block" onClick={() => p.onAcceptAll(filter)}>
          <IconCheck /> Accept all {filter === "all" ? "" : CATEGORIES.find((c) => c.id === filter)?.label.toLowerCase()} ({visible.length})
        </button>
      )}

      <ul className="cards">
        {visible.map((i) => (
          <li
            key={i.id}
            className={`card card-${i.category}${i.id === p.activeId ? " is-active" : ""}`}
            onClick={() => p.onActivate(i.id)}
          >
            <div className="card-head">
              <i className={`dot dot-${i.category}`} aria-hidden="true" />
              <span className="card-title">{i.title}</span>
              <span className="card-cat">{CATEGORIES.find((c) => c.id === i.category)?.label}</span>
            </div>
            <div className="diff">
              <del>{i.original}</del>
              <span aria-hidden="true">→</span>
              <ins>{i.replacement || "(remove)"}</ins>
              {i.alternatives?.map((alt) => (
                <button
                  key={alt}
                  className="alt-chip"
                  title="Use this instead"
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onAccept(i.id, alt);
                  }}
                >
                  {alt}
                </button>
              ))}
            </div>
            {i.id === p.activeId && <p className="card-why">{i.explanation}</p>}
            <div className="card-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  p.onAccept(i.id);
                }}
              >
                Accept
              </button>
              <button
                className="btn btn-quiet btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  p.onDismiss(i.id);
                }}
              >
                Dismiss
              </button>
              <IssueMenu issue={i} onAddWord={p.onAddWord} onMute={p.onMute} onReport={p.onReport} />
            </div>
          </li>
        ))}
      </ul>

      {p.check.status === "done" && p.issues.length === 0 && (
        <div className="empty small-empty">
          <LogoMark />
          <h3>Looking good</h3>
          <p>No suggestions right now. Keep writing; Matra checks again when you pause.</p>
        </div>
      )}
    </div>
  );
}

function Write(p: Props) {
  const [prompt, setPrompt] = useState("");
  const [custom, setCustom] = useState("");
  const w = p.writer;
  const target = p.selectionWords > 0 ? `the selected ${p.selectionWords} word${p.selectionWords === 1 ? "" : "s"}` : "the whole document";

  if (w) {
    return (
      <div className="writer">
        <div className="writer-head">
          <h3 className="panel-h">{w.label}</h3>
          {w.streaming ? (
            <button className="btn btn-quiet btn-sm" onClick={p.onWriterStop}>Stop</button>
          ) : (
            <button className="icon-btn" aria-label="Discard" onClick={p.onWriterDiscard}><IconX /></button>
          )}
        </div>
        {w.error ? (
          <div className="notice notice-error" role="alert">{w.error}</div>
        ) : (
          <div className={`writer-output${w.streaming ? " is-streaming" : ""}`} aria-live="polite">
            {w.output || <span className="muted">Writing…</span>}
          </div>
        )}
        {!w.streaming && !w.error && w.output && (
          <div className="writer-actions">
            {w.hasRange && (
              <button className="btn btn-primary" onClick={() => p.onWriterApply("replace")}>
                <IconCheck /> Replace
              </button>
            )}
            <button className={`btn ${w.hasRange ? "btn-quiet" : "btn-primary"}`} onClick={() => p.onWriterApply("insert")}>
              <IconArrowDown /> Insert
            </button>
            <button
              className="btn btn-quiet"
              onClick={() => navigator.clipboard?.writeText(w.output).catch(() => undefined)}
            >
              <IconCopy /> Copy
            </button>
            {p.onRegenerate && (
              <button className="btn btn-quiet" onClick={p.onRegenerate}>
                <IconSpark /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="writer">
      <section>
        <h3 className="panel-h">Rewrite {target}</h3>
        <div className="rewrite-grid">
          {REWRITE_MODES.filter((m) => m.group === "style").map((m) => (
            <button key={m.id} className="btn btn-tile" onClick={() => p.onRewrite(m.id)}>{m.label}</button>
          ))}
        </div>
        <h3 className="panel-h panel-h-gap">Language</h3>
        <div className="rewrite-grid">
          {REWRITE_MODES.filter((m) => m.group === "language").map((m) => (
            <button key={m.id} className="btn btn-tile" onClick={() => p.onRewrite(m.id)}>{m.label}</button>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) p.onRewrite("custom", custom);
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Or say how: “make it sound like a thank-you note”"
            aria-label="Custom rewrite instruction"
          />
          <button className="btn btn-quiet" disabled={!custom.trim()}>Go</button>
        </form>
      </section>

      <section className="compose">
        <h3 className="panel-h">Write something new</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim()) p.onCompose(prompt);
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={"e.g. “Write a polite leave request to my manager” or “Reply to this email and say yes”"}
            aria-label="What should Matra write?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) {
                e.preventDefault();
                p.onCompose(prompt);
              }
            }}
          />
          <button className="btn btn-primary btn-block" disabled={!prompt.trim()}>
            <IconSpark /> Write it
          </button>
        </form>
        <p className="muted small">Matra uses your document as context. ⌘↩ to send.</p>
      </section>
    </div>
  );
}
