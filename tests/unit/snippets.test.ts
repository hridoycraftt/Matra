import { describe, expect, it } from "vitest";
import { expandSnippet } from "../../src/lib/snippets";

const S = [{ trigger: ";sig", text: "Best regards,\nHridoy" }];

describe("expandSnippet", () => {
  it("expands a trigger followed by a space", () => {
    const v = "Thanks ;sig ";
    const r = expandSnippet(v, v.length, S)!;
    expect(r.value).toBe("Thanks Best regards,\nHridoy");
    expect(r.caret).toBe(r.value.length);
  });
  it("ignores a trigger inside a word and text without a trailing space", () => {
    expect(expandSnippet("abc;sig ", 8, S)).toBeNull();
    expect(expandSnippet("Thanks ;sig", 11, S)).toBeNull();
  });
});
