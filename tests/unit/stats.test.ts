import { describe, expect, it } from "vitest";
import { computeStats, formatMinutes } from "../../src/lib/stats";

describe("computeStats", () => {
  it("counts English text", () => {
    const s = computeStats("This is a short sentence. Here is another one.");
    expect(s.words).toBe(9);
    expect(s.sentences).toBe(2);
    expect(s.readability).not.toBeNull();
  });

  it("splits Bangla sentences on the dari and skips English readability", () => {
    const s = computeStats("আমি বাড়ি যাব। তুমি কোথায় যাবে?");
    expect(s.sentences).toBe(2);
    expect(s.readability).toBeNull();
  });

  it("handles empty text", () => {
    expect(computeStats("  ").words).toBe(0);
  });
});

it("formats minutes", () => {
  expect(formatMinutes(0.5)).toBe("30 sec");
  expect(formatMinutes(2)).toBe("2 min");
});
