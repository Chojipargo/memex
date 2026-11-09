import { decode, encode } from "gpt-tokenizer/encoding/cl100k_base";

import {
  CHUNK_MAX_TOKENS,
  CHUNK_MIN_TOKENS,
  CHUNK_OVERLAP_TOKENS,
} from "./constants";

export type SourcePage = {
  page: number;
  text: string;
};

export type DocumentChunk = {
  page: number;
  text: string;
  tokens: number;
};

type Unit = {
  page: number;
  text: string;
  tokens: number;
};

/**
 * Split on sentence-ending punctuation followed by a new sentence. The split
 * is heuristic (abbreviations can split early), but it keeps punctuation with
 * the preceding sentence and never cuts a word in half.
 */
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+(?=[A-Z0-9"'“”‘’(\[])/;

export function countTokens(text: string): number {
  return encode(text).length;
}

function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.split(SENTENCE_BOUNDARY))
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * A single sentence can be longer than the maximum chunk size (legal text,
 * tables, PDF extraction artefacts). Split it by raw tokens so every unit fits
 * inside one chunk; the chunker adds the overlap between chunks later.
 */
function splitOversized(sentence: string, page: number): Unit[] {
  const ids = encode(sentence);

  if (ids.length <= CHUNK_MAX_TOKENS) {
    return [{ page, text: sentence, tokens: ids.length }];
  }

  const units: Unit[] = [];

  for (let start = 0; start < ids.length; start += CHUNK_MAX_TOKENS) {
    const slice = ids.slice(start, start + CHUNK_MAX_TOKENS);
    const text = decode(slice).trim();

    if (text) {
      units.push({ page, text, tokens: slice.length });
    }
  }

  return units;
}

function joinedText(units: Unit[]): string {
  return units
    .map((unit) => unit.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize the text exactly as it will be stored. Per-sentence token counts
 * can differ slightly from the joined text because the separators add tokens,
 * so size decisions use this instead of summing unit counts.
 */
function joinedTokens(units: Unit[]): number {
  return countTokens(joinedText(units));
}

/**
 * The last `CHUNK_OVERLAP_TOKENS` tokens of a finished chunk become the start
 * of the next one.
 */
function takeOverlap(units: Unit[]): Unit[] {
  const last = units.at(-1);

  if (!last) {
    return [];
  }

  const ids = encode(joinedText(units));

  if (ids.length === 0) {
    return [];
  }

  const overlap = ids.slice(-CHUNK_OVERLAP_TOKENS);
  const text = decode(overlap).trim();

  return text ? [{ page: last.page, text, tokens: overlap.length }] : [];
}

/** Attribute a cross-page chunk to the page that contributed the most tokens. */
function dominantPage(units: Unit[]): number {
  const weights = new Map<number, number>();

  for (const unit of units) {
    weights.set(unit.page, (weights.get(unit.page) ?? 0) + unit.tokens);
  }

  let page = units[0]?.page ?? 1;
  let highest = -1;

  for (const [candidate, weight] of weights) {
    if (weight > highest) {
      page = candidate;
      highest = weight;
    }
  }

  return page;
}

/**
 * Chunk extracted pages into 500–800 token pieces with a 100-token overlap.
 * Chunks may span pages; `page` is the page that contributed the most tokens.
 *
 * The final chunk of a short document can be smaller than the minimum because
 * there is nothing left to fill it with. Everything else is bounded by the
 * configured minimum and maximum.
 */
export function chunkPages(pages: SourcePage[]): DocumentChunk[] {
  const units = pages.flatMap(({ page, text }) =>
    splitSentences(text).flatMap((sentence) => splitOversized(sentence, page)),
  );

  const chunks: DocumentChunk[] = [];
  let current: Unit[] = [];
  let currentTokens = 0;
  let hasFreshContent = false;

  const emit = () => {
    if (!hasFreshContent || current.length === 0) {
      return;
    }

    const text = joinedText(current);

    if (!text) {
      return;
    }

    chunks.push({
      page: dominantPage(current),
      text,
      tokens: countTokens(text),
    });
  };

  const resetWithOverlap = () => {
    current = takeOverlap(current);
    currentTokens = joinedTokens(current);
    hasFreshContent = false;
  };

  let index = 0;

  while (index < units.length) {
    const unit = units[index];
    const candidate = [...current, unit];
    const candidateTokens = joinedTokens(candidate);

    if (candidateTokens <= CHUNK_MAX_TOKENS) {
      current = candidate;
      currentTokens = candidateTokens;
      hasFreshContent = true;
      index++;
      continue;
    }

    if (currentTokens >= CHUNK_MIN_TOKENS) {
      emit();
      resetWithOverlap();
      continue;
    }

    // The chunk is below the minimum and the next unit would push it over the
    // maximum. Fill the remaining room with a token slice, then carry the rest.
    const room = CHUNK_MAX_TOKENS - currentTokens;

    if (room > 0) {
      const ids = encode(unit.text);
      let take = Math.min(room, ids.length);
      let headText = "";

      // Re-joining can add a token or two at the boundary, so shrink the slice
      // until the joined candidate actually fits.
      while (take > 0) {
        headText = decode(ids.slice(0, take)).trim();

        const fits =
          joinedTokens([
            ...current,
            { page: unit.page, text: headText, tokens: take },
          ]) <= CHUNK_MAX_TOKENS;

        if (fits) {
          break;
        }

        take--;
      }

      const restText = decode(ids.slice(take)).trim();

      if (take > 0 && headText) {
        current.push({ page: unit.page, text: headText, tokens: take });
        currentTokens = joinedTokens(current);
        hasFreshContent = true;
      }

      emit();
      resetWithOverlap();

      if (restText) {
        units[index] = {
          page: unit.page,
          text: restText,
          tokens: countTokens(restText),
        };
      } else {
        index++;
      }

      continue;
    }

    // Defensive fallback: emit whatever is pending so the loop always advances.
    if (currentTokens > 0) {
      emit();
      resetWithOverlap();
      continue;
    }

    current.push(unit);
    currentTokens = joinedTokens(current);
    hasFreshContent = true;
    index++;
  }

  emit();

  return chunks;
}
