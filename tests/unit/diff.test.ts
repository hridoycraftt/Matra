import { expect, it } from "vitest";
import { changedParts } from "../../src/lib/diff";

it("highlights only the words that change", () => {
  expect(changedParts("a umbrella", "an umbrella")).toEqual([
    { text: "an", changed: true },
    { text: " umbrella", changed: false },
  ]);
  expect(changedParts("we forget to take", "we forgot to take")).toEqual([
    { text: "we ", changed: false },
    { text: "forgot", changed: true },
    { text: " to take", changed: false },
  ]);
  expect(changedParts("goes", "go")).toEqual([{ text: "go", changed: true }]);
});
