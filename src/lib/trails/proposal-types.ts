/** Client-safe shapes for next-step proposals. */

import type { SourceOrigin } from "@/lib/rag/types";

/** One passage Claude suggests going to next, with the reason for the link. */
export type NextStepProposal = {
  chunkId: number;
  documentTitle: string;
  page: number;
  excerpt: string;
  sourceOrigin: SourceOrigin;
  sourceDomain: string | null;
  /** Why a reader would go here next: an existing link's reason, or Claude's. */
  reason: string;
  /** True when the two passages are already linked; its reason is shown. */
  existingLink: boolean;
  gist: string | null;
  /** Verified verbatim key quote, or null. */
  quote: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseProposals(value: unknown): NextStepProposal[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const proposals: NextStepProposal[] = [];

  for (const raw of value) {
    const row = asRecord(raw);
    const chunkId = row?.chunkId;
    const documentTitle = asText(row?.documentTitle);
    const reason = asText(row?.reason);

    if (
      !row ||
      typeof chunkId !== "number" ||
      !Number.isSafeInteger(chunkId) ||
      chunkId < 1 ||
      !documentTitle ||
      !reason
    ) {
      return null;
    }

    proposals.push({
      chunkId,
      documentTitle,
      page: typeof row.page === "number" ? row.page : 1,
      excerpt: typeof row.excerpt === "string" ? row.excerpt : "",
      sourceOrigin: row.sourceOrigin === "web" ? "web" : "library",
      sourceDomain: asText(row.sourceDomain),
      reason,
      existingLink: row.existingLink === true,
      gist: asText(row.gist),
      quote: asText(row.quote),
    });
  }

  return proposals;
}
