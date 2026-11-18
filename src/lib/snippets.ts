/** If the text just before the caret is a snippet trigger followed by a space or newline, expand it. */
export function expandSnippet(
  value: string,
  caret: number,
  snippets: { trigger: string; text: string }[],
): { value: string; caret: number } | null {
  const end = value[caret - 1];
  if (end !== " " && end !== "\n") return null;
  const before = value.slice(0, caret - 1);
  for (const s of snippets) {
    const t = s.trigger.trim();
    if (!t || !before.endsWith(t)) continue;
    const start = before.length - t.length;
    // Only at a word boundary, so ";sig" inside a longer word doesn't fire.
    if (start > 0 && /[\p{L}\p{N}]/u.test(value[start - 1])) continue;
    const next = value.slice(0, start) + s.text + value.slice(caret);
    return { value: next, caret: start + s.text.length };
  }
  return null;
}
