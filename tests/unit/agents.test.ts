import { expect, it } from "vitest";
import { extractJson, knownHosts } from "../../src/lib/agents";

it("reads JSON from a fenced or prose-wrapped answer", () => {
  expect(extractJson<{ a: number }>('Here you go:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  expect(extractJson<{ a: number }>('Result: {"a": 2} — done')).toEqual({ a: 2 });
  expect(extractJson("no json here")).toBeNull();
});

it("knows the sites a search visited, for Claude URLs and Gemini redirect titles", () => {
  const hosts = knownHosts([
    { title: "Climate change - Wikipedia", url: "https://en.wikipedia.org/wiki/Climate_change" },
    { title: "nasa.gov", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" },
  ]);
  expect(hosts.has("en.wikipedia.org")).toBe(true);
  expect(hosts.has("nasa.gov")).toBe(true);
  expect(hosts.has("vertexaisearch.cloud.google.com")).toBe(false);
});
