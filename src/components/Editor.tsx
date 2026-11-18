import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Issue, RewriteMode } from "../lib/types";
import { SelectionPill } from "./SelectionPill";
import { expandSnippet } from "../lib/snippets";

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
  snippets?: { trigger: string; text: string }[];
  /** Quick rewrite of the selected text, from the pill that appears next to a selection. */
  onSelectionAction?(mode: RewriteMode, custom?: string): void;
}

/**
 * A plain textarea over a mirrored backdrop. The backdrop draws the underlines,
 * so typing, IME input (Bangla keyboards), undo and spellcheck stay native.
 */
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { text, issues, activeId, onChange, onCaret, placeholder, compact, onSelectionAction, snippets },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number } | null>(null);

  /** After a selection ends, show the pill just above where the pointer let go. */
  const maybeShowPill = (clientX?: number, clientY?: number) => {
    const el = area.current;
    const wrap = box.current;
    if (!onSelectionAction || !el || !wrap) return;
    const selected = el.value.slice(el.selectionStart, el.selectionEnd).trim();
    if (!selected) return setPill(null);
    const r = wrap.getBoundingClientRect();
    const x = clientX !== undefined ? clientX - r.left : 0;
    const y = clientY !== undefined ? clientY - r.top : 0;
    setPill({ x: Math.max(0, Math.min(x - 40, r.width - 360)), y: Math.max(-44, y - 46) });
  };

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
    <div className={`editor${compact ? " is-compact" : ""}`} ref={box}>
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
        onChange={(e) => {
          setPill(null);
          const el = e.target;
          const hit = snippets?.length ? expandSnippet(el.value, el.selectionStart, snippets) : null;
          if (hit) {
            onChange(hit.value);
            requestAnimationFrame(() => el.setSelectionRange(hit.caret, hit.caret));
          } else {
            onChange(el.value);
          }
        }}
        onClick={report}
        onMouseUp={(e) => maybeShowPill(e.clientX, e.clientY)}
        onKeyUp={(e) => {
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") report();
          if (e.shiftKey && e.key.startsWith("Arrow")) maybeShowPill();
          if (e.key === "Escape") setPill(null);
        }}
        onBlur={() => setTimeout(() => setPill(null), 150)}
      />
      {pill && onSelectionAction && (
        <SelectionPill
          x={pill.x}
          y={pill.y}
          onRun={(mode, custom) => {
            setPill(null);
            onSelectionAction(mode, custom);
          }}
          onClose={() => setPill(null)}
        />
      )}
    </div>
  );
});
