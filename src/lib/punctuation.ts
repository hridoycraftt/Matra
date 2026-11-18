import type { RawIssue } from "./types";

/**
 * Matra's own punctuation checks for English and Bangla. They are deterministic, so
 * full stops, dari (।), commas and spacing are caught every time, not only when the
 * AI happens to notice. They run alongside the AI check and take precedence on overlap.
 */

const BN = /[ঀ-৿]/;
const BN_ONLY = /[ঀ-৿]/g;
const LATIN = /[A-Za-z]/g;

/** Is this stretch of text mainly Bangla? */
function isBangla(s: string): boolean {
  const bn = (s.match(BN_ONLY) ?? []).length;
  const en = (s.match(LATIN) ?? []).length;
  return bn > 0 && bn >= en;
}

function issue(text: string, start: number, original: string, replacement: string, title: string, explanation: string): RawIssue {
  return {
    category: "correctness",
    original,
    replacement,
    alternatives: [],
    prefix: text.slice(Math.max(0, start - 24), start),
    title,
    explanation,
  };
}

export function checkPunctuation(text: string): RawIssue[] {
  const out: RawIssue[] = [];
  const add = (i: RawIssue) => out.push(i);

  // 1. A space before a punctuation mark: "word ," / "শব্দ ।"
  for (const m of text.matchAll(/(\S)( +)([,.;:!?।])(?!\.)/gu)) {
    const start = m.index! + 1;
    const bn = BN.test(m[1]);
    add(
      issue(
        text,
        start - 1,
        m[1] + m[2] + m[3],
        m[1] + m[3],
        bn ? "যতিচিহ্নের আগে স্পেস" : "Space before punctuation",
        bn ? "যতিচিহ্নের আগে কোনো স্পেস হয় না।" : "Punctuation sits right after the word, with no space before it.",
      ),
    );
  }

  // 2. No space after a comma, full stop or dari when a word follows: "word,next" / "শেষ।পরের"
  for (const m of text.matchAll(/([\p{L}\p{M}])([,;।])([\p{L}\p{M}])/gu)) {
    const bn = BN.test(m[1] + m[3]);
    add(
      issue(
        text,
        m.index!,
        m[0],
        `${m[1]}${m[2]} ${m[3]}`,
        bn ? "যতিচিহ্নের পরে স্পেস" : "Missing space",
        bn ? "যতিচিহ্নের পরে একটি স্পেস দিন।" : "Add a space after the punctuation mark.",
      ),
    );
  }
  for (const m of text.matchAll(/([a-z]{2,})\.([A-Z][a-z])/g)) {
    add(issue(text, m.index!, m[0], `${m[1]}. ${m[2]}`, "Missing space", "Add a space after the full stop."));
  }

  // 3. Doubled punctuation: ",," "।।" "!!" (but not an ellipsis "...")
  for (const m of text.matchAll(/([,;:।!?])\1+/gu)) {
    const bn = m[1] === "।";
    add(
      issue(
        text,
        m.index!,
        m[0],
        m[1],
        bn ? "দুবার দাঁড়ি" : "Repeated punctuation",
        bn ? "একটি দাঁড়িই যথেষ্ট।" : "Use the punctuation mark once.",
      ),
    );
  }
  for (const m of text.matchAll(/(?<!\.)\.\.(?!\.)/g)) {
    add(issue(text, m.index!, "..", ".", "Repeated punctuation", "Use one full stop, or three dots for an ellipsis."));
  }

  // 4. Bangla sentences ending with an English full stop: "যাব." → "যাব।"
  for (const m of text.matchAll(/([ঀ-৿][ঀ-৿‌‍]*)\.(?!\.)(?=\s|$)/gu)) {
    add(issue(text, m.index!, m[0], `${m[1]}।`, "দাঁড়ি", "বাংলা বাক্য শেষ হয় দাঁড়ি (।) দিয়ে, ফুলস্টপ (.) দিয়ে নয়।"));
  }
  // …and English sentences ending with a dari: "home।" → "home."
  for (const m of text.matchAll(/([A-Za-z]+)।/g)) {
    add(issue(text, m.index!, m[0], `${m[1]}.`, "Full stop", "English sentences end with a full stop (.), not a dari (।)."));
  }

  // 5. Each paragraph should end with sentence punctuation.
  let offset = 0;
  for (const para of text.split("\n")) {
    const trimmed = para.trimEnd();
    const last = trimmed.match(/([\p{L}\p{M}\p{N}]+)$/u);
    // Skip headings and short lines (titles, greetings, sign-offs like "Best regards,").
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    if (last && words >= 4) {
      const word = last[1];
      const start = offset + trimmed.length - word.length;
      const bn = isBangla(trimmed);
      const looksLikeQuestion = bn
        ? /(কি|কী|কেন|কোথায়|কখন|কীভাবে|কে)\s/u.test(trimmed + " ")
        : /^(what|why|how|when|where|who|which|is|are|do|does|did|can|could|would|will|should)\b/i.test(trimmed);
      const end = looksLikeQuestion ? "?" : bn ? "।" : ".";
      add(
        issue(
          text,
          start,
          word,
          word + end,
          bn ? (end === "?" ? "প্রশ্নবোধক চিহ্ন" : "দাঁড়ি নেই") : end === "?" ? "Question mark" : "Missing full stop",
          bn
            ? end === "?"
              ? "প্রশ্নের শেষে প্রশ্নবোধক চিহ্ন (?) দিন।"
              : "বাক্যের শেষে দাঁড়ি (।) দিন।"
            : end === "?"
              ? "End a question with a question mark."
              : "End the sentence with a full stop.",
        ),
      );
    }
    offset += para.length + 1;
  }

  // 6. English: a sentence starts with a lowercase letter; a lone "i".
  for (const m of text.matchAll(/(^|[.!?]\s+|\n\s*)([a-z])([a-z']*)/g)) {
    const start = m.index! + m[1].length;
    const word = m[2] + m[3];
    if (word === "i" || /^(e\.g|i\.e|etc|vs)$/.test(word)) continue;
    add(issue(text, start, word, m[2].toUpperCase() + m[3], "Capital letter", "Start a sentence with a capital letter."));
  }
  for (const m of text.matchAll(/(^|[\s(])i(?=[\s,.!?;:'’]|$)/g)) {
    const start = m.index! + m[1].length;
    add(issue(text, start, "i", "I", "Capital I", "The word “I” is always a capital letter."));
  }

  // Earlier-in-text first, and only one issue per span.
  return out;
}
