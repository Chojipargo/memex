import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { chunkPages, type DocumentChunk } from "@/lib/ingestion/chunk";
import { embedTexts } from "@/lib/ingestion/embeddings";
import type { WebSource } from "@/lib/rag/types";
import { normalizeSourceUrl } from "@/lib/rag/url";
import {
  cosineSimilarity,
  type MatchedChunk,
  type ServerSupabase,
} from "@/lib/trails/server";
import type { TrailDeadline } from "@/lib/trails/timeouts";

const MAX_CHUNKS_PER_SOURCE = 8;
/** Saved web sources hold at most 8 chunks; this only bounds bad data. */
const MAX_EXISTING_CHUNKS_SCANNED = 64;
const MAX_SOURCES_PER_REQUEST = 6;
const MAX_EMBEDDED_TEXT = 200_000;
const WEB_EMBEDDING_TIMEOUT_MS = 15_000;

export class SourceIngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "SourceIngestError";
    this.status = status;
  }
}

export function sourceKeyFor(url: string): string {
  const canonical = normalizeSourceUrl(url) ?? url;
  return createHash("sha256").update(canonical).digest("hex");
}

type ExistingDocument = {
  document_id: string;
  title: string;
  source_url: string | null;
  source_domain: string | null;
  source_provider: string | null;
  retrieved_at: string | null;
};

type PendingSource = {
  source: WebSource;
  sourceKey: string;
  chunks: DocumentChunk[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function candidateFromRow(
  row: Record<string, unknown>,
  document: ExistingDocument,
  score: number,
): MatchedChunk | null {
  const chunkId =
    typeof row.id === "number"
      ? row.id
      : typeof row.id === "string"
        ? Number(row.id)
        : Number.NaN;
  const page =
    typeof row.page === "number"
      ? row.page
      : typeof row.page === "string"
        ? Number(row.page)
        : Number.NaN;
  const text = typeof row.text === "string" ? row.text : "";

  if (
    !Number.isSafeInteger(chunkId) ||
    !Number.isSafeInteger(page) ||
    !text
  ) {
    return null;
  }

  return {
    chunkId,
    documentId: document.document_id,
    documentTitle: document.title,
    page,
    content: text,
    similarity: score,
    sourceOrigin: "web",
    sourceUrl: document.source_url,
    sourceDomain: document.source_domain,
    sourceProvider: document.source_provider,
    retrievedAt: document.retrieved_at,
  };
}

function parseEmbedding(value: unknown): number[] | null {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return Array.isArray(parsed) && parsed.every((item) => typeof item === "number")
    ? (parsed as number[])
    : null;
}

/**
 * Reuse a source researched earlier, scoring its stored chunks against the
 * current question so the most relevant passages are kept, not the first ones.
 */
async function loadExistingChunks(
  supabase: ServerSupabase,
  document: ExistingDocument,
  queryEmbedding: ReadonlyArray<number>,
): Promise<MatchedChunk[]> {
  const result = await supabase
    .from("chunks")
    .select("id, page, text, embedding")
    .eq("document_id", document.document_id)
    .order("id", { ascending: true })
    .limit(MAX_EXISTING_CHUNKS_SCANNED);

  if (result.error) {
    throw new SourceIngestError(
      `Could not load a previously researched source: ${result.error.message}`,
      503,
    );
  }

  const chunks: MatchedChunk[] = [];

  for (const row of result.data ?? []) {
    const record = asRecord(row);
    const embedding = record ? parseEmbedding(record.embedding) : null;

    if (!record || !embedding) {
      continue;
    }

    const candidate = candidateFromRow(
      record,
      document,
      cosineSimilarity(queryEmbedding, embedding),
    );

    if (candidate) {
      chunks.push(candidate);
    }
  }

  return chunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CHUNKS_PER_SOURCE);
}

async function findExisting(
  supabase: ServerSupabase,
  userId: string,
  sourceKey: string,
): Promise<ExistingDocument | null> {
  const result = await supabase
    .from("documents")
    .select(
      "document_id, title, source_url, source_domain, source_provider, retrieved_at",
    )
    .eq("user_id", userId)
    .eq("source_key", sourceKey)
    .maybeSingle();

  if (result.error) {
    throw new SourceIngestError(
      `Could not check whether this source is already in your library: ${result.error.message}`,
      503,
    );
  }

  return (result.data as ExistingDocument | null) ?? null;
}

async function insertChunks(
  supabase: ServerSupabase,
  documentId: string,
  chunks: ReadonlyArray<DocumentChunk>,
  embeddings: ReadonlyArray<number[]>,
  queryEmbedding: ReadonlyArray<number>,
): Promise<MatchedChunk[]> {
  const rows = chunks.map((chunk, index) => ({
    document_id: documentId,
    page: chunk.page,
    text: chunk.text,
    embedding: JSON.stringify(embeddings[index]),
  }));
  const inserted = await supabase
    .from("chunks")
    .insert(rows)
    .select("id, page, text");

  if (inserted.error) {
    throw new SourceIngestError(
      `Could not save the researched source chunks: ${inserted.error.message}`,
      503,
    );
  }

  return (inserted.data ?? [])
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row, index) =>
      candidateFromRow(
        row,
        {
          document_id: documentId,
          title: "",
          source_url: null,
          source_domain: null,
          source_provider: null,
          retrieved_at: null,
        },
        // Rows come back in insert order, matching `embeddings`.
        embeddings[index] ? cosineSimilarity(queryEmbedding, embeddings[index]) : 0,
      ),
    )
    .filter((candidate): candidate is MatchedChunk => candidate !== null);
}

async function savePreparedSource(
  supabase: ServerSupabase,
  userId: string,
  pending: PendingSource,
  embeddings: ReadonlyArray<number[]>,
  queryEmbedding: ReadonlyArray<number>,
): Promise<MatchedChunk[]> {
  const { source, sourceKey, chunks } = pending;
  const documentId = randomUUID();
  const retrievedAt = new Date().toISOString();
  const inserted = await supabase
    .from("documents")
    .insert({
      document_id: documentId,
      user_id: userId,
      title: source.title,
      // Web sources are embedded directly into chunks, not uploaded to the
      // private Storage bucket. Keep a synthetic path to satisfy the schema.
      storage_path: `${userId}/web/${documentId}.txt`,
      mime_type: "text/plain",
      page_count: 1,
      extracted_text: source.content.slice(0, MAX_EMBEDDED_TEXT),
      extraction_method: null,
      ocr_pages: null,
      source_kind: "web",
      source_url: source.url,
      source_domain: source.domain,
      source_provider: source.provider,
      source_key: sourceKey,
      published_at: source.publishedAt,
      retrieved_at: retrievedAt,
    })
    .select("document_id")
    .single();

  if (inserted.error) {
    // Another concurrent request may have inserted this URL first.
    if (inserted.error.code === "23505") {
      const raced = await findExisting(supabase, userId, sourceKey);
      return raced ? loadExistingChunks(supabase, raced, queryEmbedding) : [];
    }

    throw new SourceIngestError(
      `Could not save the researched source: ${inserted.error.message}`,
      503,
    );
  }

  let saved: MatchedChunk[];

  try {
    saved = await insertChunks(
      supabase,
      documentId,
      chunks,
      embeddings,
      queryEmbedding,
    );
  } catch (error) {
    // Do not leave an orphaned document behind when chunks fail to insert.
    await supabase.from("documents").delete().eq("document_id", documentId);
    throw error;
  }

  return saved.map((candidate) => ({
    ...candidate,
    documentTitle: source.title,
    sourceOrigin: "web",
    sourceUrl: source.url,
    sourceDomain: source.domain,
    sourceProvider: source.provider,
    retrievedAt,
  }));
}

/**
 * Chunk, embed, and persist web sources in the user's library. Existing URLs
 * are reused instead of re-embedded, which makes repeated research cheap and
 * lets future library searches find the source.
 *
 * Every returned passage carries its real cosine similarity to
 * `queryEmbedding`, so web and library passages can be ranked together.
 */
export async function saveWebSources(
  supabase: ServerSupabase,
  userId: string,
  sources: ReadonlyArray<WebSource>,
  queryEmbedding: ReadonlyArray<number>,
  deadline: TrailDeadline,
): Promise<MatchedChunk[]> {
  const seen = new Set<string>();
  const candidates: MatchedChunk[] = [];
  const pending: PendingSource[] = [];
  let lastError: unknown = null;

  for (const source of sources.slice(0, MAX_SOURCES_PER_REQUEST)) {
    if (seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);

    try {
      const sourceKey = sourceKeyFor(source.url);
      const existing = await findExisting(supabase, userId, sourceKey);

      if (existing) {
        candidates.push(
          ...(await loadExistingChunks(supabase, existing, queryEmbedding)),
        );
        continue;
      }

      const chunks = chunkPages([
        { page: 1, text: source.content.slice(0, MAX_EMBEDDED_TEXT) },
      ]).slice(0, MAX_CHUNKS_PER_SOURCE);

      if (chunks.length > 0) {
        pending.push({ source, sourceKey, chunks });
      }
    } catch (error) {
      lastError = error;
      console.warn(
        `[rag] Could not prepare ${source.url}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (pending.length > 0) {
    const totalChunks = pending.reduce(
      (count, item) => count + item.chunks.length,
      0,
    );
    let embeddings: number[][];

    if (!deadline.canStartRequest(2_000)) {
      throw new SourceIngestError(
        "Web research ran out of time. Try again, or ask a more specific question.",
        504,
      );
    }

    try {
      embeddings = await embedTexts(
        pending.flatMap((item) => item.chunks.map((chunk) => chunk.text)),
        "RETRIEVAL_DOCUMENT",
        {
          timeoutMs: Math.min(WEB_EMBEDDING_TIMEOUT_MS, deadline.remainingMs()),
          maxAttempts: 1,
        },
      );

      if (embeddings.length !== totalChunks) {
        throw new Error("The embedding provider returned the wrong number of vectors.");
      }
    } catch (error) {
      throw new SourceIngestError(
        error instanceof Error
          ? `Could not embed the researched sources: ${error.message}`
          : "Could not embed the researched sources.",
        502,
      );
    }

    let cursor = 0;

    for (const item of pending) {
      const sourceEmbeddings = embeddings.slice(
        cursor,
        cursor + item.chunks.length,
      );
      cursor += item.chunks.length;

      try {
        candidates.push(
          ...(await savePreparedSource(
            supabase,
            userId,
            item,
            sourceEmbeddings,
            queryEmbedding,
          )),
        );
      } catch (error) {
        lastError = error;
        console.warn(
          `[rag] Could not save ${item.source.url}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
  }

  if (candidates.length === 0 && lastError instanceof Error) {
    if (lastError instanceof SourceIngestError) {
      throw lastError;
    }

    throw new SourceIngestError(lastError.message, 503);
  }

  return candidates
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SOURCES_PER_REQUEST * MAX_CHUNKS_PER_SOURCE);
}
