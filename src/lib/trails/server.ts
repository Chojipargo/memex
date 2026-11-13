import "server-only";

import { EmbeddingError, embedTexts } from "@/lib/ingestion/embeddings";
import type { SourceOrigin } from "@/lib/rag/types";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrailApi, TrailApiStep } from "@/lib/trails/api";
import {
  TRAIL_COVERAGE_THRESHOLD,
  type TrailCandidate,
  type TrailStepDraft,
} from "@/lib/trails/generate";
import { fromCodePointIndex, toCodePointIndex } from "@/lib/trails/quote";
import {
  TRAIL_EMBEDDING_MAX_ATTEMPTS,
  TRAIL_EMBEDDING_TIMEOUT_MS,
} from "@/lib/trails/timeouts";

export type ServerSupabase = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

export type MatchedChunk = TrailCandidate & {
  similarity: number;
};

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
    (lower.includes("function") && lower.includes("does not exist")) ||
    (lower.includes("column") && lower.includes("does not exist"))
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

/** Payload element for create_generated_trail / append_generated_trail_steps. */
export function toRpcStep(step: TrailStepDraft, content: string) {
  return {
    chunk_id: step.chunkId,
    note: step.note,
    gist: step.gist,
    // Postgres measures text in code points; JS offsets are UTF-16 units.
    quote_start: step.quote ? toCodePointIndex(content, step.quote.start) : null,
    quote_end: step.quote ? toCodePointIndex(content, step.quote.end) : null,
  };
}

/** API step for a freshly generated draft step and its source candidate. */
export function buildApiStep(
  position: number,
  step: TrailStepDraft,
  candidate: TrailCandidate,
): TrailApiStep {
  return {
    position,
    chunkId: step.chunkId,
    documentId: candidate.documentId,
    documentTitle: candidate.documentTitle,
    page: candidate.page,
    note: step.note,
    gist: step.gist,
    quote: step.quote
      ? candidate.content.slice(step.quote.start, step.quote.end)
      : null,
    content: candidate.content,
    excerpt: makeExcerpt(candidate.content),
    sourceOrigin: candidate.sourceOrigin ?? "library",
    sourceUrl: candidate.sourceUrl ?? null,
    sourceDomain: candidate.sourceDomain ?? null,
    sourceProvider: candidate.sourceProvider ?? null,
    retrievedAt: candidate.retrievedAt ?? null,
  };
}

function readSourceOrigin(value: unknown): SourceOrigin {
  return value === "web" ? "web" : "library";
}

/** Slice a stored quote (code-point offsets) out of the chunk text. */
function sliceStoredQuote(
  content: string,
  start: number | null,
  end: number | null,
): string | null {
  if (start === null || end === null || start >= end) {
    return null;
  }

  const quote = content
    .slice(fromCodePointIndex(content, start), fromCodePointIndex(content, end))
    .trim();

  return quote || null;
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
      sourceOrigin: readSourceOrigin(row.source_kind),
      sourceUrl: asNonEmptyString(row.source_url),
      sourceDomain: asNonEmptyString(row.source_domain),
      sourceProvider: asNonEmptyString(row.source_provider),
      retrievedAt: asNonEmptyString(row.retrieved_at),
    });
  }

  return chunks;
}

/** Embed retrieval queries (questions, not documents) in one request. */
export async function embedQueries(queries: string[]): Promise<number[][]> {
  const embeddings = await embedTexts(queries, "RETRIEVAL_QUERY", {
    timeoutMs: TRAIL_EMBEDDING_TIMEOUT_MS,
    maxAttempts: TRAIL_EMBEDDING_MAX_ATTEMPTS,
  });

  if (embeddings.length !== queries.length || embeddings.some((vector) => !vector)) {
    throw new EmbeddingError(
      "The embedding provider returned no vector for this question.",
    );
  }

  return embeddings;
}

/**
 * Return the user's chunks closest to an embedded query. Chunk ids in
 * `excludeChunkIds` are removed after retrieval, so the RPC is asked for extra
 * rows to keep roughly `count` candidates available.
 */
export async function matchCandidates(
  supabase: ServerSupabase,
  queryEmbedding: number[],
  count = 30,
  excludeChunkIds: ReadonlySet<number> = new Set(),
): Promise<MatchedChunk[]> {
  const match = await supabase.rpc("match_documents", {
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

/**
 * The user's passages nearest to one of their passages, by its stored
 * embedding (no embedding call). Used to keep a trail's next step close to
 * where it currently is.
 */
export async function matchNearChunk(
  supabase: ServerSupabase,
  chunkId: number,
  count = 30,
  excludeChunkIds: ReadonlySet<number> = new Set(),
): Promise<MatchedChunk[]> {
  const match = await supabase.rpc("match_documents_near_chunk", {
    p_chunk_id: chunkId,
    match_count: Math.min(99, count + excludeChunkIds.size),
  });

  if (match.error) {
    throw new TrailError(
      trailSetupHint(match.error.message, "continuing trails") ??
        "Could not search near this passage.",
      503,
    );
  }

  const candidates = parseMatchedChunks(match.data);

  if (!candidates) {
    throw new TrailError("The retrieval service returned an unexpected response.", 502);
  }

  return candidates
    .filter((candidate) => !excludeChunkIds.has(candidate.chunkId))
    .slice(0, count);
}

/** Cosine similarity of two embeddings (Gemini vectors are L2-normalized). */
export function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
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

  const parent = asRecord(firstRelationship(record.parent));

  return {
    id,
    question,
    title,
    model,
    createdAt,
    updatedAt: asNonEmptyString(record.updated_at),
    parentTrailId: asNonEmptyString(record.parent_trail_id),
    parentTitle: asNonEmptyString(parent?.title),
  };
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
    const link = asRecord(firstRelationship(row.links));
    const note = asNonEmptyString(link?.reason) ?? asString(row.note);
    const documentId = asNonEmptyString(chunk.document_id);
    const documentTitle = asNonEmptyString(document.title);
    const page = asInteger(chunk.page, 1);
    const content = asString(chunk.text);
    const gist = asNonEmptyString(row.gist);
    const quoteStart = asInteger(row.quote_start, 0);
    const quoteEnd = asInteger(row.quote_end, 1);

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
      linkId: asNonEmptyString(row.link_id),
      annotation: asNonEmptyString(row.annotation),
      gist,
      quote: sliceStoredQuote(content, quoteStart, quoteEnd),
      content,
      excerpt: makeExcerpt(content),
      sourceOrigin: readSourceOrigin(document.source_kind),
      sourceUrl: asNonEmptyString(document.source_url),
      sourceDomain: asNonEmptyString(document.source_domain),
      sourceProvider: asNonEmptyString(document.source_provider),
      retrievedAt: asNonEmptyString(document.retrieved_at),
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
    .select(
      "id, question, title, model, created_at, updated_at, parent_trail_id, parent:parent_trail_id(title)",
    )
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
      "position, chunk_id, note, link_id, annotation, gist, quote_start, quote_end, links(reason), chunks!inner(document_id, page, text, documents!inner(title, source_kind, source_url, source_domain, source_provider, retrieved_at))",
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
