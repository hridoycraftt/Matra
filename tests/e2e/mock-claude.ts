import type { Page, Route } from "@playwright/test";

/** The issues a check of the welcome document returns. */
export const WELCOME_CHECK = {
  language: "mixed",
  score: 72,
  tone_labels: ["friendly", "informal"],
  tone_summary: "Warm and welcoming, with a few slips.",
  issues: [
    { category: "correctness", original: "you're", replacement: "your", prefix: "checks ", title: "Wrong word", explanation: "Use the possessive “your”." },
    { category: "correctness", original: "Their", replacement: "There", prefix: "", title: "Wrong word", explanation: "“There are” introduces something that exists." },
    { category: "correctness", original: "work", replacement: "works", prefix: "how it ", title: "Agreement", explanation: "“It” takes “works”." },
    { category: "correctness", original: "করিব", replacement: "করব", prefix: "অংশগ্রহন ", title: "সাধু-চলিত মিশ্রণ", explanation: "চলিত রীতিতে “করব” লিখুন।" },
    { category: "correctness", original: "অংশগ্রহন", replacement: "অংশগ্রহণ", prefix: "এ ", title: "বানান", explanation: "ণত্ব বিধান অনুযায়ী “অংশগ্রহণ”।" },
  ],
};

function message(text: string) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function sse(text: string) {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const chunks = text.match(/.{1,12}/gsu) ?? [];
  return [
    ev("message_start", {
      message: { ...message(""), content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } },
    }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ...chunks.map((c) => ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: c } })),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } }),
    ev("message_stop", {}),
  ].join("");
}

export interface MockLog {
  requests: Record<string, unknown>[];
}

export async function mockClaude(
  page: Page,
  opts: { check?: object; written?: string; status?: number } = {},
): Promise<MockLog> {
  const log: MockLog = { requests: [] };
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "POST, OPTIONS",
        },
      });
    }
    const body = req.postDataJSON() as Record<string, unknown>;
    log.requests.push(body);
    const cors = { "access-control-allow-origin": "*" };
    if (opts.status) {
      return route.fulfill({
        status: opts.status,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
      });
    }
    if (body.stream) {
      return route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "text/event-stream" },
        body: sse(opts.written ?? "A shorter version."),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify(message(JSON.stringify(opts.check ?? WELCOME_CHECK))),
    });
  });
  return log;
}

/** Use Claude (Anthropic) with a test key. */
export async function withKey(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("matra.devApiKey.anthropic", "sk-ant-test");
    if (sessionStorage.getItem("matra.test.seeded")) return; // keep what the test changes across reloads
    sessionStorage.setItem("matra.test.seeded", "1");
    const saved = JSON.parse(localStorage.getItem("matra.settings.v1") ?? "{}");
    localStorage.setItem("matra.settings.v1", JSON.stringify({ ...saved, provider: "anthropic", onboarded: true }));
  });
}

/** Use Google Gemini with a test key, and answer its requests. */
export async function mockGemini(page: Page, opts: { check?: object; written?: string } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("matra.devApiKey.google", "AIza-test");
    localStorage.setItem("matra.settings.v1", JSON.stringify({ provider: "google", onboarded: true }));
  });
  const urls: string[] = [];
  await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    urls.push(req.url());
    if (req.url().includes(":streamGenerateContent")) {
      const text = opts.written ?? "A shorter version.";
      const chunks = text.match(/.{1,12}/gsu) ?? [];
      const body = chunks
        .map((c) => `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: c }] }, index: 0 }] })}\r\n\r\n`)
        .join("");
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body });
    }
    if (req.url().includes("/models?") || req.url().endsWith("/models")) {
      return route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ models: [{ name: "models/gemini-test-flash", displayName: "Gemini Test Flash", supportedActions: ["generateContent"] }] }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify({
        candidates: [
          { content: { role: "model", parts: [{ text: JSON.stringify(opts.check ?? WELCOME_CHECK) }] }, finishReason: "STOP", index: 0 },
        ],
      }),
    });
  });
  return urls;
}
