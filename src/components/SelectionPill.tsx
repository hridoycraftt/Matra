import { useState } from "react";
import type { RewriteMode } from "../lib/types";
import { IconSpark } from "./Icons";

const PRESETS: { id: RewriteMode; label: string }[] = [
  { id: "improve", label: "Improve" },
  { id: "shorten", label: "Shorten" },
  { id: "formal", label: "Formal" },
  { id: "friendly", label: "Friendly" },
];

/** The small pill that appears next to selected text: quick rewrites or "Tell Matra to…". */
export function SelectionPill({
  x,
  y,
  onRun,
  onClose,
  inline,
}: {
  x: number;
  y: number;
  /** Render in place (inside the floating card) rather than positioned over the editor. */
  inline?: boolean;
  onRun(mode: RewriteMode, custom?: string): void;
  onClose(): void;
}) {
  const [asking, setAsking] = useState(false);
  const [custom, setCustom] = useState("");
  // Keep the text selection while clicking the pill.
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className={`sel-pill${inline ? " is-inline" : ""}`}
      style={inline ? undefined : { left: x, top: y }}
      role="toolbar"
      aria-label="Rewrite the selected text"
    >
      {asking ? (
        <form
          className="sel-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) onRun("custom", custom);
          }}
        >
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Tell Matra to… (e.g. make it sound warmer)"
            aria-label="Tell Matra what to do with the selected text"
          />
          <button className="btn btn-primary btn-sm" disabled={!custom.trim()}>Go</button>
        </form>
      ) : (
        <>
          <span className="sel-mark" aria-hidden="true">
            <IconSpark size={14} />
          </span>
          {PRESETS.map((p) => (
            <button key={p.id} className="sel-btn" onMouseDown={keep} onClick={() => onRun(p.id)}>
              {p.label}
            </button>
          ))}
          <button className="sel-btn sel-btn-ask" onMouseDown={keep} onClick={() => setAsking(true)}>
            Tell Matra to…
          </button>
        </>
      )}
    </div>
  );
}
