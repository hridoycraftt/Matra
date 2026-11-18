import { useEffect, useRef, useState } from "react";
import type { Goals } from "../lib/types";
import { IconTarget } from "./Icons";

const OPTIONS: { key: keyof Goals; label: string; values: [string, string][] }[] = [
  { key: "audience", label: "Audience", values: [["general", "General"], ["knowledgeable", "Knowledgeable"], ["expert", "Expert"]] },
  { key: "formality", label: "Formality", values: [["informal", "Informal"], ["neutral", "Neutral"], ["formal", "Formal"]] },
  {
    key: "domain",
    label: "Kind of writing",
    values: [["general", "General"], ["email", "Email"], ["business", "Business"], ["academic", "Academic"], ["creative", "Creative"], ["social", "Social post"]],
  },
  { key: "intent", label: "Goal", values: [["inform", "Inform"], ["convince", "Convince"], ["describe", "Describe"], ["tell_story", "Tell a story"]] },
];

export function GoalsMenu({ goals, onChange }: { goals: Goals; onChange(g: Goals): void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const summary = `${cap(goals.formality)} · ${OPTIONS[2].values.find(([v]) => v === goals.domain)?.[1]}`;

  return (
    <div className="popover-root" ref={root}>
      <button className="btn btn-quiet" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <IconTarget /> <span className="hide-narrow">{summary}</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Writing goals">
          <div className="popover-title">Set goals for this document</div>
          {OPTIONS.map((o) => (
            <fieldset key={o.key}>
              <legend>{o.label}</legend>
              <div className="pills">
                {o.values.map(([v, l]) => (
                  <button
                    key={v}
                    className={`pill${goals[o.key] === v ? " is-on" : ""}`}
                    aria-pressed={goals[o.key] === v}
                    onClick={() => onChange({ ...goals, [o.key]: v })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
