/** Client-safe shapes for trail editing. */

/** A connection an edit would create, with the reason to review. */
export type RewritePair = {
  /** 1-based position of the target step in the new order. */
  position: number;
  sourceChunkId: number;
  targetChunkId: number;
  sourceTitle: string;
  targetTitle: string;
  /** Set when the two passages are already linked; its reason is reused. */
  existingLinkId: string | null;
  /** Existing reason, Claude's suggestion, or "" when neither is available. */
  reason: string;
  /** True when `reason` came from Claude rather than an existing link. */
  suggested: boolean;
};

export type RewriteStepInput = {
  chunkId: number;
  /** Reason for the link from the previous step. Needed for new connections. */
  reason?: string;
  /** claude_accepted when the reader kept Claude's suggestion unchanged. */
  reasonOrigin?: "user" | "claude_accepted";
};

export const ANNOTATION_MAX_CHARS = 4000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asChunkId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** Parse a list of chunk ids; null if any entry is invalid. */
export function parseChunkIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids = value.map(asChunkId);
  return ids.every((id): id is number => id !== null) ? ids : null;
}

export function parseRewriteSteps(value: unknown): RewriteStepInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const steps: RewriteStepInput[] = [];

  for (const raw of value) {
    const row = asRecord(raw);
    const chunkId = asChunkId(row?.chunkId);

    if (!row || chunkId === null) {
      return null;
    }

    const reason = typeof row.reason === "string" ? row.reason.trim() : "";

    steps.push({
      chunkId,
      ...(reason ? { reason } : {}),
      reasonOrigin: row.reasonOrigin === "claude_accepted" ? "claude_accepted" : "user",
    });
  }

  return steps;
}

export function parseRewritePairs(value: unknown): RewritePair[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const pairs: RewritePair[] = [];

  for (const raw of value) {
    const row = asRecord(raw);
    const sourceChunkId = asChunkId(row?.sourceChunkId);
    const targetChunkId = asChunkId(row?.targetChunkId);

    if (
      !row ||
      typeof row.position !== "number" ||
      sourceChunkId === null ||
      targetChunkId === null ||
      typeof row.sourceTitle !== "string" ||
      typeof row.targetTitle !== "string" ||
      typeof row.reason !== "string"
    ) {
      return null;
    }

    pairs.push({
      position: row.position,
      sourceChunkId,
      targetChunkId,
      sourceTitle: row.sourceTitle,
      targetTitle: row.targetTitle,
      existingLinkId: typeof row.existingLinkId === "string" ? row.existingLinkId : null,
      reason: row.reason,
      suggested: row.suggested === true,
    });
  }

  return pairs;
}
