import type { Issue, RawIssue } from "./types";

let counter = 0;
const nextId = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`;

function occurrences(text: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = text.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = text.indexOf(needle, i + 1);
  }
  return out;
}

/**
 * Pin model-reported issues to exact ranges. The model gives the exact span and
 * the text right before it; offsets from a model are not trusted.
 * Issues that cannot be found, or that overlap an earlier one, are dropped.
 */
export function locateIssues(text: string, raw: RawIssue[]): Issue[] {
  const placed: Issue[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && a < e);

  for (const r of raw) {
    if (!r.original || r.original === r.replacement) continue;
    const hits = occurrences(text, r.original);
    if (hits.length === 0) continue;
    const prefix = (r.prefix ?? "").trimEnd();
    const ranked = [...hits].sort((a, b) => score(b) - score(a));
    function score(pos: number) {
      if (!prefix) return 0;
      const before = text.slice(Math.max(0, pos - prefix.length - 2), pos).trimEnd();
      return before.endsWith(prefix) ? 1 : 0;
    }
    const pos = ranked.find((p) => !overlaps(p, p + r.original.length));
    if (pos === undefined) continue;
    const issue: Issue = { ...r, id: nextId(), start: pos, end: pos + r.original.length };
    placed.push(issue);
    taken.push([issue.start, issue.end]);
  }
  return placed.sort((a, b) => a.start - b.start);
}

/** Apply one issue's replacement and shift every other issue. */
export function applyIssue(text: string, issues: Issue[], id: string): { text: string; issues: Issue[] } {
  const target = issues.find((i) => i.id === id);
  if (!target || text.slice(target.start, target.end) !== target.original) {
    return { text, issues: issues.filter((i) => i.id !== id) };
  }
  const next = text.slice(0, target.start) + target.replacement + text.slice(target.end);
  const delta = target.replacement.length - target.original.length;
  const rest = issues
    .filter((i) => i.id !== id)
    .filter((i) => i.end <= target.start || i.start >= target.end)
    .map((i) => (i.start >= target.end ? { ...i, start: i.start + delta, end: i.end + delta } : i));
  return { text: next, issues: rest };
}

/**
 * After the user edits the text, keep issues whose span still matches,
 * moving each to the nearest place its original text now appears.
 */
export function remapIssues(prevText: string, nextText: string, issues: Issue[]): Issue[] {
  if (prevText === nextText) return issues;
  // Find the edited window: common prefix and suffix.
  let p = 0;
  const max = Math.min(prevText.length, nextText.length);
  while (p < max && prevText[p] === nextText[p]) p++;
  let s = 0;
  while (
    s < max - p &&
    prevText[prevText.length - 1 - s] === nextText[nextText.length - 1 - s]
  )
    s++;
  const prevEditEnd = prevText.length - s;
  const delta = nextText.length - prevText.length;

  const inserted = nextText.slice(p, nextText.length - s);
  const removed = prevText.slice(p, prevEditEnd);
  // Typing straight onto the end or start of a flagged word changes that word.
  const wordEdge = /[\p{L}\p{M}\p{N}'’]/u;
  const touchesEnd = wordEdge.test(inserted.charAt(0) || removed.charAt(0));
  const touchesStart = wordEdge.test(inserted.charAt(inserted.length - 1) || removed.charAt(removed.length - 1));

  const out: Issue[] = [];
  for (const i of issues) {
    if (i.end < p || (i.end === p && !touchesEnd)) out.push(i);
    else if (i.start > prevEditEnd || (i.start === prevEditEnd && !touchesStart))
      out.push({ ...i, start: i.start + delta, end: i.end + delta });
    // Issues touching the edited region are dropped: the user is rewriting them.
  }
  return out.filter((i) => nextText.slice(i.start, i.end) === i.original);
}
