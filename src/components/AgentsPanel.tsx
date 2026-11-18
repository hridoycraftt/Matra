import { useRef, useState } from "react";
import {
  checkPlagiarism,
  estimateAI,
  findCitations,
  gradeText,
  readerReactions,
  type AIEstimate,
  type CitationResult,
  type GradeResult,
  type PlagiarismResult,
  type ReaderReaction,
} from "../lib/agents";
import { friendlyError } from "../lib/ai";
import type { Goals, Settings } from "../lib/types";
import { ExternalLink } from "./ExternalLink";
import { IconCitation, IconCopy, IconDetector, IconGrader, IconPlagiarism, IconReaders } from "./Icons";

export interface AgentsContext {
  text: string;
  goals: Goals;
  settings: Settings;
  apiKey: string | null;
}

const READERS = ["My manager", "A customer", "A hiring manager", "My teacher", "A friend"];

type Tool = "readers" | "grader" | "detector" | "plagiarism" | "citations";

/** Matra's agents: deeper checks you run on purpose, not on every pause. */
export function AgentsPanel({ ctx }: { ctx: AgentsContext }) {
  const [open, setOpen] = useState<Tool | null>("readers");
  const empty = !ctx.text.trim();
  return (
    <div className="agents">
      {empty && <div className="notice">Write something first; agents work on the whole text.</div>}
      <Agent
        id="readers"
        open={open}
        onOpen={setOpen}
        Icon={IconReaders}
        tint="indigo"
        title="Reader reactions"
        sub="How a specific reader will take it"
      >
        <Readers ctx={ctx} disabled={empty} />
      </Agent>
      <Agent id="grader" open={open} onOpen={setOpen} Icon={IconGrader} tint="teal" title="AI grader" sub="Grade against a rubric or brief">
        <Grader ctx={ctx} disabled={empty} />
      </Agent>
      <Agent
        id="detector"
        open={open}
        onOpen={setOpen}
        Icon={IconDetector}
        tint="amber"
        title="AI-writing estimate"
        sub="Which parts read as AI-written"
      >
        <Detector ctx={ctx} disabled={empty} />
      </Agent>
      <Agent
        id="plagiarism"
        open={open}
        onOpen={setOpen}
        Icon={IconPlagiarism}
        tint="pink"
        title="Plagiarism check"
        sub="Searches the web for matching passages"
      >
        <Plagiarism ctx={ctx} disabled={empty} />
      </Agent>
      <Agent
        id="citations"
        open={open}
        onOpen={setOpen}
        Icon={IconCitation}
        tint="blue"
        title="Citation finder"
        sub="Sources for your claims, APA · MLA · Chicago"
      >
        <Citations ctx={ctx} disabled={empty} />
      </Agent>
    </div>
  );
}

function Agent(p: {
  id: Tool;
  open: Tool | null;
  onOpen(t: Tool | null): void;
  Icon: (p: { size?: number }) => React.ReactElement;
  tint: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const isOpen = p.open === p.id;
  return (
    <section className={`agent${isOpen ? " is-open" : ""}`}>
      <button className="agent-head" aria-expanded={isOpen} onClick={() => p.onOpen(isOpen ? null : p.id)}>
        <span className={`tile tile-${p.tint}`} aria-hidden="true">
          <p.Icon size={15} />
        </span>
        <span className="agent-title">
          <strong>{p.title}</strong>
          <span>{p.sub}</span>
        </span>
      </button>
      {isOpen && <div className="agent-body">{p.children}</div>}
    </section>
  );
}

/** Shared run/abort/error state for one agent. */
function useRun<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const run = async (fn: (signal: AbortSignal) => Promise<T>) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setError(null);
    try {
      setResult(await fn(c.signal));
    } catch (e) {
      if (!c.signal.aborted) setError(friendlyError(e).message);
    } finally {
      if (ctrl.current === c) setBusy(false);
    }
  };
  return { result, busy, error, run };
}

function Readers({ ctx, disabled }: { ctx: AgentsContext; disabled: boolean }) {
  const [reader, setReader] = useState(READERS[0]);
  const { result, busy, error, run } = useRun<ReaderReaction>();
  return (
    <>
      <div className="pills">
        {READERS.map((r) => (
          <button key={r} className={`pill${reader === r ? " is-on" : ""}`} aria-pressed={reader === r} onClick={() => setReader(r)}>
            {r}
          </button>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          run((s) => readerReactions(ctx.apiKey, ctx.text, reader, ctx.goals, ctx.settings, s));
        }}
      >
        <input value={reader} onChange={(e) => setReader(e.target.value)} aria-label="Who is reading?" placeholder="Who is reading?" />
        <button className="btn btn-primary" disabled={disabled || busy || !reader.trim()}>{busy ? "Reading…" : "Run"}</button>
      </form>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {result && (
        <div className="agent-result" aria-live="polite">
          <p className="agent-lead">{result.overall}</p>
          {result.feels.length > 0 && (
            <div className="tones">
              {result.feels.map((f) => (
                <span key={f} className="tone">{f}</span>
              ))}
            </div>
          )}
          {result.questions.length > 0 && (
            <>
              <h4>They may ask</h4>
              <ul>{result.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </>
          )}
          {result.improvements.length > 0 && (
            <>
              <h4>To land better</h4>
              <ul>
                {result.improvements.map((i) => (
                  <li key={i.quote}>
                    <q>{i.quote}</q> — {i.suggestion}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Grader({ ctx, disabled }: { ctx: AgentsContext; disabled: boolean }) {
  const [rubric, setRubric] = useState("");
  const { result, busy, error, run } = useRun<GradeResult>();
  return (
    <>
      <textarea
        className="rules"
        rows={3}
        value={rubric}
        onChange={(e) => setRubric(e.target.value)}
        placeholder="Paste the rubric or assignment brief (optional)"
        aria-label="Rubric or assignment brief"
      />
      <button
        className="btn btn-primary btn-block"
        disabled={disabled || busy}
        onClick={() => run((s) => gradeText(ctx.apiKey, ctx.text, rubric, ctx.settings, s))}
      >
        {busy ? "Grading…" : "Grade my text"}
      </button>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {result && (
        <div className="agent-result" aria-live="polite">
          <div className="grade">
            <span className="grade-letter">{result.grade}</span>
            <span className="muted">{Math.max(0, Math.min(100, result.score))} / 100</span>
          </div>
          {result.strengths.length > 0 && (
            <>
              <h4>Strengths</h4>
              <ul>{result.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
          {result.improvements.length > 0 && (
            <>
              <h4>To improve</h4>
              <ul>{result.improvements.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Detector({ ctx, disabled }: { ctx: AgentsContext; disabled: boolean }) {
  const { result, busy, error, run } = useRun<AIEstimate>();
  const pct = result ? Math.max(0, Math.min(100, Math.round(result.percent))) : 0;
  return (
    <>
      <p className="muted small">
        An estimate from writing style, not proof. Use it to spot passages that sound generic.
      </p>
      <button
        className="btn btn-primary btn-block"
        disabled={disabled || busy}
        onClick={() => run((s) => estimateAI(ctx.apiKey, ctx.text, ctx.settings, s))}
      >
        {busy ? "Estimating…" : "Estimate"}
      </button>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {result && (
        <div className="agent-result" aria-live="polite">
          <div className="meter" role="img" aria-label={`About ${pct}% reads as AI-written`}>
            <div className="meter-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="agent-lead">
            <strong>About {pct}%</strong> reads as AI-written. {result.verdict}
          </p>
          {result.passages.length > 0 && (
            <ul>
              {result.passages.map((x) => (
                <li key={x.quote}>
                  <q>{x.quote}</q> — {x.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function Plagiarism({ ctx, disabled }: { ctx: AgentsContext; disabled: boolean }) {
  const { result, busy, error, run } = useRun<PlagiarismResult>();
  const pct = result ? Math.max(0, Math.min(100, Math.round(result.originalPercent))) : 0;
  return (
    <>
      <p className="muted small">Matra searches the web for your most distinctive sentences. It can take up to a minute.</p>
      <button className="btn btn-primary btn-block" disabled={disabled || busy} onClick={() => run((s) => checkPlagiarism(ctx.apiKey, ctx.text, ctx.settings, s))}>
        {busy ? "Searching the web…" : "Check for plagiarism"}
      </button>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {result && (
        <div className="agent-result" aria-live="polite">
          <div className="meter" role="img" aria-label={`About ${pct}% looks original`}>
            <div className="meter-fill meter-ok" style={{ width: `${pct}%` }} />
          </div>
          <p className="agent-lead">
            <strong>About {pct}% looks original.</strong> {result.summary}
          </p>
          {result.matches.length > 0 ? (
            <ul>
              {result.matches.map((m) => (
                <li key={m.quote + m.url}>
                  <q>{m.quote}</q> — {m.similarity} match on{" "}
                  <ExternalLink href={m.url}>{m.source || new URL(m.url).hostname}</ExternalLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No matching pages were found.</p>
          )}
        </div>
      )}
    </>
  );
}

function Citations({ ctx, disabled }: { ctx: AgentsContext; disabled: boolean }) {
  const [style, setStyle] = useState<"APA" | "MLA" | "Chicago">("APA");
  const { result, busy, error, run } = useRun<CitationResult>();
  return (
    <>
      <div className="pills" role="group" aria-label="Citation style">
        {(["APA", "MLA", "Chicago"] as const).map((s) => (
          <button key={s} className={`pill${style === s ? " is-on" : ""}`} aria-pressed={style === s} onClick={() => setStyle(s)}>
            {s}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-block" disabled={disabled || busy} onClick={() => run((sig) => findCitations(ctx.apiKey, ctx.text, style, ctx.settings, sig))}>
        {busy ? "Finding sources…" : "Find sources"}
      </button>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {result && (
        <div className="agent-result" aria-live="polite">
          {result.claims.length === 0 && <p className="muted small">No claims that need a citation, or no reliable sources found.</p>}
          {result.claims.map((c) => (
            <div key={c.claim} className="claim">
              <h4>{c.claim}</h4>
              {c.sources.map((s) => (
                <div key={s.url} className="citation">
                  <p>{s.citation}</p>
                  <div className="citation-actions">
                    <ExternalLink href={s.url}>Open source</ExternalLink>
                    <button className="btn btn-quiet btn-sm" onClick={() => navigator.clipboard?.writeText(s.citation).catch(() => undefined)}>
                      <IconCopy size={14} /> Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
