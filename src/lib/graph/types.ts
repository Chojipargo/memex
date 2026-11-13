/** Client-safe shapes for the usage-weighted association graph. */

import type { LinkedPassage, LinkOrigin } from "@/lib/links/types";
import type { SourceOrigin } from "@/lib/rag/types";

export type GraphNode = LinkedPassage & {
  /** How many of the reader's trails pass through this passage. */
  trailCount: number;
  /** Total association strength plus trail appearances. */
  score: number;
};

export type GraphEdge = {
  source: number;
  target: number;
  /** Link strength plus trail co-occurrence, after fading. */
  weight: number;
  linkStrength: number;
  cooccurrence: number;
  /** The stronger link between the two passages, if they are linked at all. */
  linkId: string | null;
  origin: LinkOrigin | null;
  reason: string | null;
  traversalCount: number;
};

export type AssociationGraph = {
  halfLifeDays: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asId(value: unknown): number | null {
  const id = asNumber(value);
  return id !== null && Number.isSafeInteger(id) && id >= 1 ? id : null;
}

function parseOrigin(value: unknown): SourceOrigin {
  return value === "web" ? "web" : "library";
}

/** Parse get_association_graph output (or the API body). Null when invalid. */
export function parseAssociationGraph(value: unknown): AssociationGraph | null {
  const record = asRecord(value);

  if (!record || !Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    return null;
  }

  const nodes: GraphNode[] = [];

  for (const raw of record.nodes) {
    const row = asRecord(raw);
    const chunkId = asId(row?.chunkId);
    const documentId = asText(row?.documentId);
    const documentTitle = asText(row?.documentTitle);

    if (!row || chunkId === null || !documentId || !documentTitle) {
      return null;
    }

    nodes.push({
      chunkId,
      page: asId(row.page) ?? 1,
      content: typeof row.content === "string" ? row.content : "",
      documentId,
      documentTitle,
      sourceOrigin: parseOrigin(row.sourceOrigin ?? row.sourceKind),
      sourceUrl: asText(row.sourceUrl),
      sourceDomain: asText(row.sourceDomain),
      sourceProvider: asText(row.sourceProvider),
      retrievedAt: asText(row.retrievedAt),
      trailCount: asNumber(row.trailCount) ?? 0,
      score: asNumber(row.score) ?? 0,
    });
  }

  const edges: GraphEdge[] = [];

  for (const raw of record.edges) {
    const row = asRecord(raw);
    const source = asId(row?.source);
    const target = asId(row?.target);
    const weight = asNumber(row?.weight);

    if (!row || source === null || target === null || weight === null) {
      return null;
    }

    edges.push({
      source,
      target,
      weight,
      linkStrength: asNumber(row.linkStrength) ?? 0,
      cooccurrence: asNumber(row.cooccurrence) ?? 0,
      linkId: asText(row.linkId),
      origin: row.origin === "user" ? "user" : row.origin === "claude_accepted" ? "claude_accepted" : null,
      reason: asText(row.reason),
      traversalCount: asNumber(row.traversalCount) ?? 0,
    });
  }

  return { halfLifeDays: asNumber(record.halfLifeDays) ?? 30, nodes, edges };
}
