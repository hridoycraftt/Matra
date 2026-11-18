/** Split a replacement into parts that stay the same and parts that change, word by word. */
export function changedParts(original: string, replacement: string): { text: string; changed: boolean }[] {
  const a = original.split(/(\s+)/);
  const b = replacement.split(/(\s+)/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const parts = [
    { text: b.slice(0, start).join(""), changed: false },
    { text: b.slice(start, b.length - end).join(""), changed: true },
    { text: b.slice(b.length - end).join(""), changed: false },
  ];
  return parts.filter((p) => p.text.length > 0);
}
