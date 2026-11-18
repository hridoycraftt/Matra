import { describe, expect, it } from "vitest";
import { applyIssue, locateIssues, remapIssues } from "../../src/lib/locate";
import type { RawIssue } from "../../src/lib/types";

const raw = (original: string, replacement: string, prefix = ""): RawIssue => ({
  category: "correctness",
  original,
  replacement,
  prefix,
  title: "t",
  explanation: "e",
});

describe("locateIssues", () => {
  it("pins an exact span", () => {
    const [i] = locateIssues("I has a cat.", [raw("has", "have")]);
    expect([i.start, i.end]).toEqual([2, 5]);
  });

  it("uses the prefix to pick the right repeated word", () => {
    const text = "their book and their pen are there";
    const [i] = locateIssues(text, [raw("their", "the", "and ")]);
    expect(i.start).toBe(text.indexOf("their pen"));
  });

  it("drops spans that are not in the text, and no-op fixes", () => {
    expect(locateIssues("hello", [raw("bye", "x"), raw("hello", "hello")])).toEqual([]);
  });

  it("drops overlapping spans", () => {
    const out = locateIssues("a very very big", [raw("very very", "very"), raw("very big", "huge")]);
    expect(out).toHaveLength(1);
  });

  it("works on Bangla text", () => {
    const text = "আমি মিটিং এ অংশগ্রহন করিব।";
    const [i] = locateIssues(text, [raw("করিব", "করব")]);
    expect(text.slice(i.start, i.end)).toBe("করিব");
  });
});

describe("applyIssue", () => {
  it("replaces and shifts later issues", () => {
    const text = "I has a apple.";
    const issues = locateIssues(text, [raw("has", "have"), raw("a apple", "an apple")]);
    const r = applyIssue(text, issues, issues[0].id);
    expect(r.text).toBe("I have a apple.");
    expect(r.text.slice(r.issues[0].start, r.issues[0].end)).toBe("a apple");
  });
});

describe("remapIssues", () => {
  it("keeps issues after an edit earlier in the text", () => {
    const text = "Hello. I has a cat.";
    const issues = locateIssues(text, [raw("has", "have")]);
    const next = "Hello there. I has a cat.";
    const out = remapIssues(text, next, issues);
    expect(next.slice(out[0].start, out[0].end)).toBe("has");
  });

  it("drops an issue the user is editing", () => {
    const text = "I has a cat.";
    const issues = locateIssues(text, [raw("has", "have")]);
    expect(remapIssues(text, "I hasn't a cat.", issues)).toHaveLength(0);
  });
});

describe("remapIssues word edges", () => {
  it("keeps an issue when a space is typed after it", () => {
    const text = "I has";
    const issues = locateIssues(text, [raw("has", "have")]);
    expect(remapIssues(text, "I has a", issues)).toHaveLength(1);
  });
});
