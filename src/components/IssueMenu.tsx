import { useEffect, useRef, useState } from "react";
import type { Issue } from "../lib/types";
import { IconMore } from "./Icons";

export interface IssueMenuActions {
  onAddWord?(id: string): void;
  onMute(id: string): void;
  onReport(id: string): void;
}

/** A single misspelled-looking word can be added to the personal dictionary. */
export const canAddWord = (i: Issue) => i.category === "correctness" && /^[\p{L}\p{M}'’-]+$/u.test(i.original.trim());

/** The ⋯ menu on a suggestion: dictionary, "turn off suggestions like this", "incorrect suggestion". */
export function IssueMenu({ issue, onAddWord, onMute, onReport }: { issue: Issue } & IssueMenuActions) {
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

  const act = (fn: (id: string) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    fn(issue.id);
  };

  return (
    <div className="issue-menu" ref={root}>
      <button
        className="icon-btn"
        aria-label="More options for this suggestion"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <IconMore size={18} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {onAddWord && canAddWord(issue) && (
            <button role="menuitem" onClick={act(onAddWord)}>
              Add “{issue.original.trim()}” to dictionary
            </button>
          )}
          <button role="menuitem" onClick={act(onMute)}>
            Turn off “{issue.title}” suggestions
          </button>
          <button role="menuitem" onClick={act(onReport)}>
            Incorrect suggestion
          </button>
        </div>
      )}
    </div>
  );
}
