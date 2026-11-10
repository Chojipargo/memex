import type { ExtractionPage } from "./types";

const PAGE_MARKER = /^--- Page (\d+) ---[ \t]*$/gm;

/**
 * The review textarea uses visible page markers so edits stay attributable to
 * a page. A single-page document stays marker-free.
 */
export function composeExtractedText(pages: ExtractionPage[]): string {
  if (pages.length <= 1) {
    return pages[0]?.text.trim() ?? "";
  }

  return pages
    .map((page) => `--- Page ${page.page} ---\n\n${page.text.trim()}`)
    .join("\n\n");
}

/**
 * Recover pages from the editable review text. If the user removes the page
 * markers we fall back to one page, which is still valid for embedding.
 */
export function splitExtractedPages(text: string): ExtractionPage[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  const matches = [...normalized.matchAll(PAGE_MARKER)];

  if (matches.length === 0) {
    return [{ page: 1, text: normalized, method: "ocr" }];
  }

  const pages = matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end =
        index + 1 < matches.length
          ? (matches[index + 1].index ?? normalized.length)
          : normalized.length;

      return {
        page: Number(match[1]) || index + 1,
        text: normalized.slice(start, end).trim(),
        method: "ocr" as const,
      };
    })
    .filter((page) => page.text.length > 0);

  // Preserve anything the user typed above the first page marker.
  const preamble = normalized.slice(0, matches[0].index ?? 0).trim();

  if (preamble) {
    if (pages[0]?.page === 1) {
      pages[0] = {
        ...pages[0],
        text: `${preamble}\n\n${pages[0].text}`.trim(),
      };
    } else {
      pages.unshift({ page: 1, text: preamble, method: "ocr" });
    }
  }

  return pages;
}

/** Plain text for the local note body and instant search. */
export function displayExtractedText(pages: ExtractionPage[]): string {
  return pages
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join("\n\n");
}
