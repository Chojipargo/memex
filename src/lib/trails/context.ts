// Shape and runtime validation for GET /api/chunks/[id]/context.

export type ChunkNeighbor = {
  chunkId: number;
  page: number;
  content: string;
};

export type ChunkContext = {
  previous: ChunkNeighbor | null;
  current: ChunkNeighbor;
  next: ChunkNeighbor | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseNeighbor(value: unknown): ChunkNeighbor | null {
  const record = asRecord(value);

  if (
    !record ||
    typeof record.chunkId !== "number" ||
    !Number.isInteger(record.chunkId) ||
    typeof record.page !== "number" ||
    !Number.isInteger(record.page) ||
    typeof record.content !== "string"
  ) {
    return null;
  }

  return {
    chunkId: record.chunkId,
    page: record.page,
    content: record.content,
  };
}

export function parseChunkContext(value: unknown): ChunkContext | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const current = parseNeighbor(record.current);
  const previous = record.previous === null ? null : parseNeighbor(record.previous);
  const next = record.next === null ? null : parseNeighbor(record.next);

  if (
    !current ||
    (record.previous !== null && !previous) ||
    (record.next !== null && !next)
  ) {
    return null;
  }

  return { previous, current, next };
}
