import { expect, test } from "@playwright/test";
import { mockClaude, mockGemini, withKey } from "./mock-claude";

test("asks for an API key before the first check", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect Matra's AI" })).toBeVisible();
  await page.getByRole("button", { name: "Open Settings" }).click();
  await page.getByLabel("Google Gemini API key").fill("AIza-test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("● Google Gemini key saved")).toBeVisible();
});

test("checks English and Bangla, underlines issues, and applies a fix", async ({ page }) => {
  await withKey(page);
  const log = await mockClaude(page);
  await page.goto("/");

  await page.getByRole("button", { name: /^Check/ }).click();
  await expect(page.locator(".card")).toHaveCount(5);
  await expect(page.locator("mark.hl")).toHaveCount(5);
  await expect(page.locator(".ring-label")).toHaveText("72");
  await expect(page.locator(".tone").first()).toHaveText("friendly");

  // The request carries the goals, structured output and refusal fallback.
  const req = log.requests[0] as { output_config: { format: { type: string } }; fallbacks: string; model: string };
  expect(req.model).toBe("claude-opus-5-5");
  expect(req.output_config.format.type).toBe("json_schema");
  expect(req.fallbacks).toBe("default");

  const bangla = page.locator(".card", { hasText: "সাধু-চলিত" });
  await bangla.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByLabel("Document text")).toHaveValue(/অংশগ্রহন করব।/);
  await expect(page.locator(".card")).toHaveCount(4);

  await page.getByRole("button", { name: /Accept all/ }).click();
  await expect(page.locator(".card")).toHaveCount(0);
  await expect(page.getByLabel("Document text")).toHaveValue(/checks your writing/);
  await expect(page.getByLabel("Document text")).toHaveValue(/There are a few/);
  await expect(page.getByLabel("Document text")).toHaveValue(/অংশগ্রহণ করব।/);
});

test("rewrites a selection with streaming output and replaces it", async ({ page }) => {
  await withKey(page);
  await mockClaude(page, { written: "আমি কাল তোমাকে ফোন দেব।" });
  await page.goto("/");
  const editor = page.getByLabel("Document text");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    const start = el.value.indexOf("ami kal");
    el.focus();
    el.setSelectionRange(start, el.value.length);
  });
  await page.getByRole("tab", { name: "Write with AI" }).click();
  await page.getByRole("button", { name: "Banglish → Bangla" }).click();
  await expect(page.locator(".writer-output")).toHaveText("আমি কাল তোমাকে ফোন দেব।");
  await page.getByRole("button", { name: "Replace" }).click();
  await expect(editor).toHaveValue(/আমি কাল তোমাকে ফোন দেব।$/);
  await expect(editor).not.toHaveValue(/ami kal/);
});

test("composes new text from a prompt and inserts it", async ({ page }) => {
  await withKey(page);
  await mockClaude(page, { written: "Dear Sir, I would like to request leave." });
  await page.goto("/");
  await page.getByRole("button", { name: /New document/ }).click();
  await page.getByRole("tab", { name: "Write with AI" }).click();
  await page.getByLabel("What should Matra write?").fill("leave email to my boss");
  await page.getByRole("button", { name: "Write it" }).click();
  await page.getByRole("button", { name: "Insert" }).click();
  await expect(page.getByLabel("Document text")).toHaveValue("Dear Sir, I would like to request leave.");
});

test("shows a clear message when the key is rejected", async ({ page }) => {
  await withKey(page);
  await mockClaude(page, { status: 401 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Check/ }).click();
  await expect(page.getByRole("alert")).toContainText("API key was not accepted");
});

test("keeps documents between launches", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /New document/ }).click();
  await page.getByLabel("Document text").fill("আমার নতুন লেখা");
  await page.reload();
  await expect(page.getByLabel("Document text")).toHaveValue("আমার নতুন লেখা");
  await expect(page.locator(".doc-item")).toHaveCount(2);
});

test("settings show the version and the update control", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Document text")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(/Matra 0\.\d+\.\d+/)).toBeVisible();
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByText("Updates work in the installed Mac app")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("narrow window has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("works with a free Google Gemini key", async ({ page }) => {
  const urls = await mockGemini(page, { written: "আমি কাল তোমাকে ফোন দেব।" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Check/ }).click();
  await expect(page.locator(".card")).toHaveCount(5);
  expect(urls[0]).toContain("gemini-flash-latest:generateContent");

  const editor = page.getByLabel("Document text");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(el.value.indexOf("ami kal"), el.value.length);
  });
  await page.getByRole("tab", { name: "Write with AI" }).click();
  await page.getByRole("button", { name: "Banglish → Bangla" }).click();
  await expect(page.locator(".writer-output")).toHaveText("আমি কাল তোমাকে ফোন দেব।");
});

test("settings switch between Google and Anthropic keys", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Google Gemini" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Google Gemini API key").fill("AIza-test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("● Google Gemini key saved")).toBeVisible();
  await page.getByRole("radio", { name: "Anthropic Claude" }).click();
  await expect(page.getByLabel("Anthropic Claude API key")).toBeVisible();
});

test("floating panel preview checks text from another app", async ({ page }) => {
  await mockGemini(page, {
    check: {
      language: "en",
      score: 61,
      tone_labels: ["polite"],
      tone_summary: "Polite.",
      issues: [
        { category: "correctness", original: "you're", replacement: "your", prefix: "Thank you for ", title: "Wrong word", explanation: "Possessive." },
        { category: "correctness", original: "has", replacement: "have", prefix: "I ", title: "Agreement", explanation: "I have." },
      ],
    },
  });
  await page.goto("/?view=panel");
  await expect(page.getByText("in Mail")).toBeVisible();
  await expect(page.locator(".card")).toHaveCount(2, { timeout: 10_000 });
  await page.locator(".card", { hasText: "Agreement" }).getByRole("button", { name: "Accept" }).click();
  await expect(page.getByLabel("Document text")).toHaveValue(/I have attached/);
});

test("suggestion card shows one fix at a time and applies it", async ({ page }) => {
  await mockGemini(page, {
    check: {
      language: "en",
      score: 61,
      tone_labels: [],
      tone_summary: "",
      issues: [
        { category: "correctness", original: "you're", replacement: "your", prefix: "Thank you for ", title: "Wrong word", explanation: "Possessive." },
        { category: "correctness", original: "has", replacement: "have", prefix: "I ", title: "Agreement", explanation: "I have." },
      ],
    },
  });
  await page.goto("/?view=panel&mode=card");
  await expect(page.getByText("2 suggestions")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("1/2")).toBeVisible();
  await page.getByRole("button", { name: "Next suggestion" }).click();
  await expect(page.locator(".sugg-title")).toContainText("Agreement");
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByText("1 suggestion", { exact: true })).toBeVisible();
  // The card is small: it fits in a 340px-wide window without scrolling.
  const box = await page.locator(".sugg").boundingBox();
  expect(box!.height).toBeLessThan(240);
});

test("add to dictionary stops flagging the word and teaches later checks", async ({ page }) => {
  await withKey(page);
  const log = await mockClaude(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Check/ }).click();
  await expect(page.locator(".card")).toHaveCount(5);
  await page.locator(".card", { hasText: "Agreement" }).getByRole("button", { name: "Add to dictionary" }).click();
  await expect(page.locator(".card")).toHaveCount(4);
  await page.getByRole("button", { name: /^Check/ }).click();
  await expect.poll(() => log.requests.length).toBe(2);
  const body = JSON.stringify(log.requests[1]);
  expect(body).toContain("personal dictionary");
  expect(body).toContain("work");
  // Checks after that drop the word even if the model flags it again.
  await expect(page.locator(".card")).toHaveCount(4);
});
