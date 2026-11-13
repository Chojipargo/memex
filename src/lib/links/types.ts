/** Client-safe shapes and parsers for associative links and backlinks. */

import type { Note } from "@/lib/dashboard/data";
import type { SourceOrigin } from "@/lib/rag/types";

export type LinkOrigin = "user" | "claude_accepted";

export const LINK_REASON_MAX_CHARS = 1000;

/** A passage at the far end of a link. */
export type LinkedPassage = {
  chunkId: number;
  page: number;
  content: string;
  documentId: string;
  documentTitle: string;
  sourceOrigin: SourceOrigin;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceProvider: string | null;
  retrievedAt: string | null;
};

export type PassageLink = {
  linkId: string;
  reason: string;
  origin: LinkOrigin;
  traversalCount: number;
  /** outgoing: this passage leads to the other; incoming: the other leads here. */
  direction: "outgoing" | "incoming";
  passage: LinkedPassage;
};

export type TrailNeighbor = {
  chunkId: number;
  documentTitle: string;
  excerpt: string;
};

export type PassageTrail = {
  trailId: string;
  title: string;
  /** 1-based position of this passage on the trail. */
  position: number;
  stepCount: number;
  annotation: string | null;
  previous: TrailNeighbor | null;
  next: TrailNeighbor | null;
};

export type PassageBacklinks = {
  links: PassageLink[];
  trails: PassageTrail[];
};

/** A passage found by searching the library, e.g. to link to. */
export type PassageSearchResult = {
  chunkId: number;
  documentTitle: string;
  page: number;
  excerpt: string;
  similarity: number;
  sourceOrigin: SourceOrigin;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asInteger(value: unknown, minimum = 0): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= minimum ? value : null;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
  }

  return null;
}

function parseOrigin(value: unknown): SourceOrigin {
  return value === "web" ? "web" : "library";
}

function parsePassage(value: unknown): LinkedPassage | null {
  const row = asRecord(value);
  const chunkId = asInteger(row?.chunkId, 1);
  const page = asInteger(row?.page, 1);
  const documentId = asNonEmptyString(row?.documentId);
  const documentTitle = asNonEmptyString(row?.documentTitle);

  if (!row || chunkId === null || page === null || !documentId || !documentTitle) {
    return null;
  }

  return {
    chunkId,
    page,
    content: typeof row.content === "string" ? row.content : "",
    documentId,
    documentTitle,
    // The RPC returns the document's source_kind; the API passes sourceOrigin.
    sourceOrigin: parseOrigin(row.sourceOrigin ?? row.sourceKind),
    sourceUrl: asNonEmptyString(row.sourceUrl),
    sourceDomain: asNonEmptyString(row.sourceDomain),
    sourceProvider: asNonEmptyString(row.sourceProvider),
    retrievedAt: asNonEmptyString(row.retrievedAt),
  };
}

function parseNeighbor(value: unknown): TrailNeighbor | null {
  const row = asRecord(value);
  const chunkId = asInteger(row?.chunkId, 1);
  const documentTitle = asNonEmptyString(row?.documentTitle);

  if (!row || chunkId === null || !documentTitle) {
    return null;
  }

  return {
    chunkId,
    documentTitle,
    excerpt: typeof row.excerpt === "string" ? row.excerpt : "",
  };
}

/** Parse get_passage_backlinks output or the API body. Null means invalid. */
export function parsePassageBacklinks(value: unknown): PassageBacklinks | null {
  const record = asRecord(value);

  if (!record || !Array.isArray(record.links) || !Array.isArray(record.trails)) {
    return null;
  }

  const links: PassageLink[] = [];

  for (const raw of record.links) {
    const row = asRecord(raw);
    const linkId = asNonEmptyString(row?.linkId);
    const reason = asNonEmptyString(row?.reason);
    const passage = parsePassage(row?.passage);

    if (!row || !linkId || !reason || !passage) {
      return null;
    }

    links.push({
      linkId,
      reason,
      origin: row.origin === "user" ? "user" : "claude_accepted",
      traversalCount: asInteger(row.traversalCount, 0) ?? 0,
      direction: row.direction === "incoming" ? "incoming" : "outgoing",
      passage,
    });
  }

  const trails: PassageTrail[] = [];

  for (const raw of record.trails) {
    const row = asRecord(raw);
    const trailId = asNonEmptyString(row?.trailId);
    const title = asNonEmptyString(row?.title);
    const position = asInteger(row?.position, 1);
    const stepCount = asInteger(row?.stepCount, 1);

    if (!row || !trailId || !title || position === null || stepCount === null) {
      return null;
    }

    trails.push({
      trailId,
      title,
      position,
      stepCount,
      annotation: asNonEmptyString(row.annotation),
      previous: row.previous ? parseNeighbor(row.previous) : null,
      next: row.next ? parseNeighbor(row.next) : null,
    });
  }

  return { links, trails };
}

export function parsePassageSearchResults(value: unknown): PassageSearchResult[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const results: PassageSearchResult[] = [];

  for (const raw of value) {
    const row = asRecord(raw);
    const chunkId = asInteger(row?.chunkId, 1);
    const documentTitle = asNonEmptyString(row?.documentTitle);
    const page = asInteger(row?.page, 1);

    if (!row || chunkId === null || !documentTitle || page === null) {
      return null;
    }

    results.push({
      chunkId,
      documentTitle,
      page,
      excerpt: typeof row.excerpt === "string" ? row.excerpt : "",
      similarity: typeof row.similarity === "number" ? row.similarity : 0,
      sourceOrigin: parseOrigin(row.sourceOrigin),
    });
  }

  return results;
}

/** A workspace note for a passage reached through a link, so the reader can open it. */
export function linkedPassageToNote(passage: LinkedPassage): Note {
  const flat = passage.content.replace(/\s+/g, " ").trim();

  return {
    id: `chunk-${passage.chunkId}`,
    title: passage.documentTitle,
    excerpt: flat.slice(0, 170) + (flat.length > 170 ? "…" : ""),
    body: passage.content,
    tag: `${passage.documentTitle} · p.${passage.page}`,
    kind: "quote",
    updatedAt: "Just now",
    pinned: false,
    source: passage.documentTitle,
    chunkId: passage.chunkId,
    sourceOrigin: passage.sourceOrigin,
    ...(passage.sourceUrl ? { sourceUrl: passage.sourceUrl } : {}),
    ...(passage.sourceDomain ? { sourceDomain: passage.sourceDomain } : {}),
    ...(passage.sourceProvider ? { sourceProvider: passage.sourceProvider } : {}),
    ...(passage.retrievedAt ? { retrievedAt: passage.retrievedAt } : {}),
  };
}
