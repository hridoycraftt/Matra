export interface TextStats {
  words: number;
  characters: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
  speakingMinutes: number;
  /** Flesch reading ease, English only (null for Bangla-heavy text). */
  readability: number | null;
}

const BANGLA = /[ঀ-৿]/g;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function computeStats(text: string): TextStats {
  const trimmed = text.trim();
  if (!trimmed) {
    return { words: 0, characters: 0, sentences: 0, paragraphs: 0, readingMinutes: 0, speakingMinutes: 0, readability: null };
  }
  const words = trimmed.split(/\s+/u).filter(Boolean);
  // "।" is the Bangla full stop (dari).
  const sentences = trimmed.split(/[.!?।]+(?:\s|$)/u).filter((s) => s.trim().length > 0).length || 1;
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const banglaChars = (trimmed.match(BANGLA) ?? []).length;
  const letters = trimmed.replace(/\s/g, "").length;
  const mostlyBangla = banglaChars / Math.max(1, letters) > 0.3;

  let readability: number | null = null;
  if (!mostlyBangla && words.length >= 5) {
    const syl = words.reduce((n, w) => n + syllables(w), 0);
    const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
    readability = Math.round(Math.max(0, Math.min(100, score)));
  }

  return {
    words: words.length,
    characters: text.length,
    sentences,
    paragraphs,
    readingMinutes: words.length / 238,
    speakingMinutes: words.length / 150,
    readability,
  };
}

export function formatMinutes(m: number): string {
  if (m === 0) return "0 sec";
  if (m < 1) return `${Math.max(1, Math.round(m * 60))} sec`;
  const whole = Math.floor(m);
  const sec = Math.round((m - whole) * 60);
  return sec ? `${whole} min ${sec} sec` : `${whole} min`;
}
