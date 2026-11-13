// Pure text helpers for grounding model-picked quotes in chunk text.
// No server-only or framework imports: used by the API, the client, and tests.

export const QUOTE_MIN_CHARS = 20;
export const QUOTE_MAX_CHARS = 600;
const OVERLAP_SEARCH_CHARS = 1500;
const OVERLAP_MIN_CHARS = 20;

type Normalized = {
  text: string;
  /** map[i] = index in the original string of normalized char i; map[text.length] = original length. */
  map: number[];
};

const SOFT_HYPHEN = "­";
const SINGLE_QUOTES = new Set(["‘", "’", "‚", "‛", "′"]);
const DOUBLE_QUOTES = new Set(["“", "”", "„", "‟", "″"]);
const DASHES = new Set(["‐", "‑", "‒", "–", "—", "―", "−"]);

/**
 * Collapse whitespace, unify curly quotes and dashes, and drop soft hyphens,
 * keeping a map from each normalized index back to the original string.
 */
export function normalizeWithMap(input: string): Normalized {
  let text = "";
  const map: number[] = [];
  let inWhitespace = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (char === SOFT_HYPHEN) {
      continue;
    }

    if (/\s/.test(char)) {
      if (!inWhitespace) {
        text += " ";
        map.push(index);
        inWhitespace = true;
      }

      continue;
    }

    inWhitespace = false;
    text += SINGLE_QUOTES.has(char)
      ? "'"
      : DOUBLE_QUOTES.has(char)
        ? '"'
        : DASHES.has(char)
          ? "-"
          : char;
    map.push(index);
  }

  map.push(input.length);
  return { text, map };
}

export function normalizeText(input: string): string {
  return normalizeWithMap(input).text.trim();
}

/**
 * Find `quote` inside `chunkText` despite whitespace, quote-style, dash, and
 * soft-hyphen differences. Returns UTF-16 offsets into the original
 * `chunkText`, or null when the quote is too short/long, missing, or ambiguous.
 */
export function locateQuote(
  chunkText: string,
  quote: string,
): { start: number; end: number } | null {
  const needle = normalizeText(quote);

  if (needle.length < QUOTE_MIN_CHARS || needle.length > QUOTE_MAX_CHARS) {
    return null;
  }

  const haystack = normalizeWithMap(chunkText);
  const found = haystack.text.indexOf(needle);

  if (found === -1 || haystack.text.indexOf(needle, found + 1) !== -1) {
    return null;
  }

  const start = haystack.map[found];
  const end = haystack.map[found + needle.length - 1] + 1;

  return start < end ? { start, end } : null;
}

/**
 * Find the overlap where the end of `previousText` repeats as the start of
 * `currentText` (compared normalized, searching at most ~1,500 chars).
 * Returns where the repeated suffix begins in `previousText` and where the
 * new material begins in `currentText`, or null when there is no overlap.
 */
export function findOverlap(
  previousText: string,
  currentText: string,
): { previousEnd: number; currentStart: number } | null {
  const previousOffset = Math.max(0, previousText.length - OVERLAP_SEARCH_CHARS);
  const previous = normalizeWithMap(previousText.slice(previousOffset));
  const current = normalizeWithMap(currentText.slice(0, OVERLAP_SEARCH_CHARS));

  // Ignore whitespace at the seam itself.
  const previousTrimmed = previous.text.trimEnd();
  const leading = current.text.length - current.text.trimStart().length;
  const currentTrimmed = current.text.slice(leading);
  const maxLength = Math.min(previousTrimmed.length, currentTrimmed.length);

  for (let length = maxLength; length >= OVERLAP_MIN_CHARS; length--) {
    if (previousTrimmed.endsWith(currentTrimmed.slice(0, length))) {
      return {
        previousEnd: previousOffset + previous.map[previousTrimmed.length - length],
        currentStart: current.map[leading + length],
      };
    }
  }

  return null;
}

/**
 * Return `currentText` without the part that repeats the end of
 * `previousText` (chunks overlap by ~100 tokens).
 */
export function trimOverlap(previousText: string, currentText: string): string {
  const overlap = findOverlap(previousText, currentText);
  return overlap ? currentText.slice(overlap.currentStart).trimStart() : currentText;
}

/** Postgres counts characters in code points; JS strings index UTF-16 units. */
export function toCodePointIndex(text: string, utf16Index: number): number {
  return Array.from(text.slice(0, utf16Index)).length;
}

export function fromCodePointIndex(text: string, codePointIndex: number): number {
  let utf16 = 0;
  let points = 0;

  for (const char of text) {
    if (points >= codePointIndex) {
      break;
    }

    utf16 += char.length;
    points++;
  }

  return utf16;
}
