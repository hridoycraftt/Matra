import { expect, it } from "vitest";
import { pickBestModel } from "../../src/lib/providers/google";

it("picks the newest plain Flash model the key can use", () => {
  expect(pickBestModel(["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash-preview"])).toBe("gemini-3.5-flash");
  expect(pickBestModel(["gemini-2.0-flash-001", "gemini-2.5-pro"])).toBe("gemini-2.0-flash-001");
  expect(pickBestModel([])).toBeNull();
});
