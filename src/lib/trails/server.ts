import "server-only";

import { EmbeddingError, embedTexts } from "@/lib/ingestion/embeddings";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrailApi, TrailApiStep } from "@/lib/trails/api";
import {
  TRAIL_COVERAGE_THRESHOLD,
  type TrailCandidate,
} from "@/lib/trails/generate";

export type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

export type MatchedChunk = TrailCandidate & {
  similarity: number;
};

export const LOW_COVERAGE_MESSAGE =
  "Your library doesn't cover this yet. Upload sources on this topic first.";

export const TRAIL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TrailError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrailError";
    this.status = status;
  }
}

/** Translate common Postgres/PostgREST setup failures into an actionable hint. */
export function trailSetupHint(message: string, action: string): string | null {
  const lower = message.toLowerCase();

  if (
    (lower.includes("relation") && lower.includes("does not exist")) ||
    lower.includes("could not find the table") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the function") ||
    (lower.includes("function") && lower.includes("does not exist"))
  ) {
    return `The generated trails migrations are missing. Apply the Supabase migrations before ${action}.`;
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "The database rejected the trail request. Check the RLS policies from the Supabase migration.";
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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

function asNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function makeExcerpt(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 280);
}

export function parseMatchedChunks(value: unknown): MatchedChunk[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const chunks: MatchedChunk[] = [];

  for (const rawRow of value) {
    const row = asRecord(rawRow);

    if (!row) {
      return null;
    }

    const chunkId = asInteger(row.chunk_id, 1);
    const documentId = asNonEmptyString(row.document_id);
    const documentTitle = asNonEmptyString(row.title);
    const page = asInteger(row.page, 1);
    const content = asString(row.content);
    const similarity = asNumber(row.similarity);

    if (
      chunkId === null ||
      !documentId ||
      !documentTitle ||
      page === null ||
      content === null ||
      similarity === null
    ) {
      return null;
    }

    chunks.push({
      chunkId,
      documentId,
      documentTitle,
      page,
      content,
      similarity,
    });
  }

  return chunks;
}

/**
 * Embed a retrieval query and return the user's closest chunks. Chunk ids in
 * `excludeChunkIds` are removed after retrieval, so the RPC is asked for extra
 * rows to keep roughly `count` candidates available.
 */
export async function findCandidates(
  supabase: ServerSupabase,
  query: string,
  count = 30,
  excludeChunkIds: ReadonlySet<number> = new Set(),
): Promise<MatchedChunk[]> {
  const [queryEmbedding] = await embedTexts([query], "RETRIEVAL_QUERY");

  if (!queryEmbedding) {
    throw new EmbeddingError(
      "The embedding provider returned no vector for this question.",
    );
  }

  const match = await supabase.rpc("match_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: Math.min(100, count + excludeChunkIds.size),
  });

  if (match.error) {
    throw new TrailError(
      trailSetupHint(match.error.message, "building trails") ??
        "Could not search your library.",
      503,
    );
  }

  const candidates = parseMatchedChunks(match.data);

  if (!candidates) {
    throw new TrailError(
      "The retrieval service returned an unexpected response.",
      502,
    );
  }

  return candidates
    .filter((candidate) => !excludeChunkIds.has(candidate.chunkId))
    .slice(0, count);
}

/** True when the best candidate is similar enough to be worth an LLM call. */
export function hasCoverage(candidates: ReadonlyArray<MatchedChunk>): boolean {
  const bestSimilarity = candidates.reduce(
    (best, candidate) => Math.max(best, candidate.similarity),
    0,
  );

  return candidates.length > 0 && bestSimilarity >= TRAIL_COVERAGE_THRESHOLD;
}

function firstRelationship(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

type TrailHeader = Omit<TrailApi, "steps">;

function parseTrailHeader(value: unknown): TrailHeader | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const id = asNonEmptyString(record.id);
  const question = asNonEmptyString(record.question);
  const title = asNonEmptyString(record.title);
  const model = asNonEmptyString(record.model);
  const createdAt = asNonEmptyString(record.created_at);

  if (!id || !question || !title || !model || !createdAt) {
    return null;
  }

  return { id, question, title, model, createdAt };
}

function parseTrailSteps(value: unknown): TrailApiStep[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const steps: TrailApiStep[] = [];

  for (const rawRow of value) {
    const row = asRecord(rawRow);

    if (!row) {
      return null;
    }

    const chunk = asRecord(firstRelationship(row.chunks));

    if (!chunk) {
      return null;
    }

    const document = asRecord(firstRelationship(chunk.documents));

    if (!document) {
      return null;
    }

    const position = asInteger(row.position, 1);
    const chunkId = asInteger(row.chunk_id, 1);
    const note = asString(row.note);
    const documentId = asNonEmptyString(chunk.document_id);
    const documentTitle = asNonEmptyString(document.title);
    const page = asInteger(chunk.page, 1);
    const content = asString(chunk.text);

    if (
      position === null ||
      chunkId === null ||
      note === null ||
      !documentId ||
      !documentTitle ||
      page === null ||
      content === null
    ) {
      return null;
    }

    steps.push({
      position,
      chunkId,
      documentId,
      documentTitle,
      page,
      note,
      excerpt: makeExcerpt(content),
    });
  }

  steps.sort((left, right) => left.position - right.position);

  return steps;
}

/**
 * Load one generated trail with its ordered steps. Returns null when the trail
 * does not exist or belongs to someone else.
 */
export async function loadTrail(
  supabase: ServerSupabase,
  userId: string,
  trailId: string,
): Promise<TrailApi | null> {
  if (!TRAIL_UUID_PATTERN.test(trailId)) {
    return null;
  }

  const trailResult = await supabase
    .from("trails")
    .select("id, question, title, model, created_at")
    .eq("id", trailId)
    .eq("user_id", userId)
    .maybeSingle();

  if (trailResult.error) {
    throw new TrailError(
      trailSetupHint(trailResult.error.message, "loading trails") ??
        "Could not load this trail.",
      503,
    );
  }

  if (!trailResult.data) {
    return null;
  }

  const header = parseTrailHeader(trailResult.data);

  if (!header) {
    throw new TrailError(
      "The trail service returned an unexpected response.",
      502,
    );
  }

  const stepResult = await supabase
    .from("trail_steps")
    .select(
      "position, chunk_id, note, chunks!inner(document_id, page, text, documents!inner(title))",
    )
    .eq("trail_id", trailId)
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (stepResult.error) {
    throw new TrailError(
      trailSetupHint(stepResult.error.message, "loading trails") ??
        "Could not load the steps for this trail.",
      503,
    );
  }

  const steps = parseTrailSteps(stepResult.data);

  if (!steps) {
    throw new TrailError(
      "The trail service returned an unexpected response.",
      502,
    );
  }

  return { ...header, steps };
}
