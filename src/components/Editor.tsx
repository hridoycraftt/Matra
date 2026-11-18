import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { Issue } from "../lib/types";

export interface EditorHandle {
  focus(): void;
  selection(): { start: number; end: number };
  select(start: number, end: number): void;
}

interface Props {
  text: string;
  issues: Issue[];
  activeId: string | null;
  onChange(text: string): void;
  onCaret(pos: number): void;
  placeholder?: string;
  compact?: boolean;
}

/**
 * A plain textarea over a mirrored backdrop. The backdrop draws the underlines,
 * so typing, IME input (Bangla keyboards), undo and spellcheck stay native.
 */
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { text, issues, activeId, onChange, onCaret, placeholder, compact },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    selection: () => ({ start: area.current?.selectionStart ?? 0, end: area.current?.selectionEnd ?? 0 }),
    select: (start, end) => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    },
  }));

  // Grow with the content so the page scrolls, not the textarea.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const issue of issues) {
    if (issue.start < cursor) continue;
    segments.push(text.slice(cursor, issue.start));
    segments.push(
      <mark
        key={issue.id}
        className={`hl hl-${issue.category}${issue.id === activeId ? " is-active" : ""}`}
      >
        {text.slice(issue.start, issue.end)}
      </mark>,
    );
    cursor = issue.end;
  }
  segments.push(text.slice(cursor));
  // A trailing newline needs a character after it to take up a line in the mirror.
  segments.push("​");

  const report = () => onCaret(area.current?.selectionStart ?? 0);

  return (
    <div className={`editor${compact ? " is-compact" : ""}`}>
      <div className="editor-backdrop" aria-hidden="true">
        {segments}
      </div>
      <textarea
        ref={area}
        className="editor-input"
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="sentences"
        aria-label="Document text"
        onChange={(e) => onChange(e.target.value)}
        onClick={report}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") report();
        }}
      />
    </div>
  );
});
