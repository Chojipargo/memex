import "server-only";

import { extractText } from "unpdf";

import type { SourcePage } from "./chunk";

/**
 * Extract text from a PDF page by page using unpdf's serverless PDF.js build.
 * Pages without a text layer (for example scans) come back empty and are
 * filtered out by the pipeline.
 */
export async function extractPdfPages(data: Uint8Array): Promise<SourcePage[]> {
  const { text, totalPages } = await extractText(data, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];

  return Array.from({ length: totalPages }, (_, index) => ({
    page: index + 1,
    text: (pageTexts[index] ?? "")
      .replace(/\u0000/g, "")
      .replace(/\s+\n/g, "\n")
      .trim(),
  }));
}
