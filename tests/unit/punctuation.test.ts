import { describe, expect, it } from "vitest";
import { locateIssues, applyIssue } from "../../src/lib/locate";
import { checkPunctuation } from "../../src/lib/punctuation";

/** Apply every punctuation fix and return the corrected text. */
function fixAll(text: string): string {
  let t = text;
  let issues = locateIssues(t, checkPunctuation(t));
  for (const i of [...issues].sort((a, b) => b.start - a.start)) {
    const r = applyIssue(t, issues, i.id);
    t = r.text;
    issues = r.issues;
  }
  return t;
}

describe("checkPunctuation", () => {
  it("adds a missing full stop and capital letter in English", () => {
    expect(fixAll("this is my first time in here to visiting now")).toBe("This is my first time in here to visiting now.");
  });

  it("adds a missing dari in Bangla and replaces an English full stop", () => {
    expect(fixAll("আমি কাল অফিসে যাবো এবং মিটিং এ যাব")).toBe("আমি কাল অফিসে যাবো এবং মিটিং এ যাব।");
    expect(fixAll("আমি বাড়ি যাব. তুমি কোথায় থাকো।")).toBe("আমি বাড়ি যাব। তুমি কোথায় থাকো।");
  });

  it("removes a space before punctuation and adds one after", () => {
    expect(fixAll("Hello , world.")).toBe("Hello, world.");
    expect(fixAll("আমি যাব ।")).toBe("আমি যাব।");
    expect(fixAll("Apples,oranges and pears are fruit.")).toBe("Apples, oranges and pears are fruit.");
  });

  it("collapses doubled punctuation but keeps an ellipsis", () => {
    expect(fixAll("Wait,, what happened here today.")).toBe("Wait, what happened here today.");
    expect(fixAll("আমি যাব।। তুমি থাকো।")).toBe("আমি যাব। তুমি থাকো।");
    expect(checkPunctuation("Well... I am not sure about it.")).toHaveLength(0);
  });

  it("asks for a question mark on questions", () => {
    expect(fixAll("Where are you going today")).toBe("Where are you going today?");
    expect(fixAll("তুমি কেন আজ অফিসে আসোনি")).toBe("তুমি কেন আজ অফিসে আসোনি?");
  });

  it("capitalizes a lone i", () => {
    expect(fixAll("Yesterday i went home early.")).toBe("Yesterday I went home early.");
  });

  it("leaves correct text and short lines alone", () => {
    expect(checkPunctuation("Matra checks your writing as you type. It works in Bangla too.")).toHaveLength(0);
    expect(checkPunctuation("আমি বাড়ি যাব। তুমি কোথায়?")).toHaveLength(0);
    expect(checkPunctuation("Best regards,\nHridoy")).toHaveLength(0);
  });
});
