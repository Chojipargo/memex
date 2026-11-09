import "server-only";

import { EMBEDDING_BATCH_SIZE } from "./constants";

export const EMBEDDING_MODEL = normalizeModelName(
  process.env.GEMINI_EMBEDDING_MODEL,
);

export const EMBEDDING_DIMENSIONS = positiveInteger(
  process.env.EMBEDDING_DIMENSIONS,
  1536,
);

const GEMINI_EMBEDDINGS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_TASK_TYPE = "RETRIEVAL_DOCUMENT";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 60_000;

export class EmbeddingError extends Error {
  readonly status = 502;

  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type GeminiEmbedding = {
  values?: number[];
};

type GeminiEmbeddingResponse = {
  embeddings?: GeminiEmbedding[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeModelName(value: string | undefined): string {
  return value?.trim().replace(/^models\//, "") || "gemini-embedding-001";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `gemini-embedding-001` returns unnormalized vectors when you request fewer
 * than 3072 dimensions. Normalize them so cosine distance is well-behaved.
 */
function normalizeVector(vector: number[]): number[] {
  let sum = 0;

  for (const value of vector) {
    sum += value * value;
  }

  const norm = Math.sqrt(sum);

  if (!Number.isFinite(norm) || norm === 0) {
    throw new EmbeddingError(
      "The Gemini embedding provider returned an invalid vector.",
    );
  }

  return vector.map((value) => value / norm);
}

async function requestBatch(input: string[], apiKey: string): Promise<number[][]> {
  let lastError: EmbeddingError | null = null;

  // gemini-embedding-2 rejects `taskType`; it expects task instructions in the
  // prompt instead. The default gemini-embedding-001 uses the structured field.
  const supportsTaskType = !EMBEDDING_MODEL.startsWith("gemini-embedding-2");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(
        `${GEMINI_EMBEDDINGS_URL}/${EMBEDDING_MODEL}:batchEmbedContents`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: input.map((text) => ({
              model: `models/${EMBEDDING_MODEL}`,
              content: { parts: [{ text }] },
              ...(supportsTaskType ? { taskType: EMBEDDING_TASK_TYPE } : {}),
              outputDimensionality: EMBEDDING_DIMENSIONS,
            })),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      lastError = new EmbeddingError(
        "Could not reach the Gemini embedding provider. Check the network and try again.",
      );

      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1));
      }

      continue;
    }

    const payload = (await response.json().catch(() => null)) as
      | GeminiEmbeddingResponse
      | null;

    if (response.ok) {
      const embeddings = payload?.embeddings;

      if (!Array.isArray(embeddings) || embeddings.length !== input.length) {
        throw new EmbeddingError(
          "The Gemini embedding provider returned an unexpected response.",
        );
      }

      return embeddings.map((row) => {
        const vector = row.values;

        if (
          !Array.isArray(vector) ||
          vector.length !== EMBEDDING_DIMENSIONS ||
          vector.some(
            (value) => typeof value !== "number" || !Number.isFinite(value),
          )
        ) {
          throw new EmbeddingError(
            `Embedding dimensions must match vector(${EMBEDDING_DIMENSIONS}). ` +
              "Update EMBEDDING_DIMENSIONS and the database migration together.",
          );
        }

        return normalizeVector(vector);
      });
    }

    const details = payload?.error?.message?.trim();
    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable) {
      if (response.status === 401 || response.status === 403) {
        throw new EmbeddingError(
          "The Gemini API rejected GEMINI_API_KEY. Check the key and try again.",
        );
      }

      if (response.status === 400) {
        throw new EmbeddingError(
          details
            ? `The Gemini embedding request failed: ${details}`
            : `The Gemini embedding request failed. Check GEMINI_EMBEDDING_MODEL (${EMBEDDING_MODEL}) and EMBEDDING_DIMENSIONS (${EMBEDDING_DIMENSIONS}).`,
        );
      }

      throw new EmbeddingError(
        `The Gemini embedding request failed with status ${response.status}.`,
      );
    }

    lastError = new EmbeddingError(
      response.status === 429
        ? "The Gemini embedding provider is rate-limiting requests. Try again in a moment."
        : "The Gemini embedding provider is temporarily unavailable. Try again in a moment.",
    );

    if (attempt < MAX_ATTEMPTS) {
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw (
    lastError ??
    new EmbeddingError(
      "The Gemini embedding request failed. Try again in a moment.",
    )
  );
}

/**
 * Embed chunk text with Gemini in batches of up to 64. Returns vectors in the
 * same order as the input so callers can zip them back onto their chunks.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new EmbeddingError(
      "GEMINI_API_KEY is not configured. Add it to .env.local to enable embeddings.",
    );
  }

  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const batchVectors = await requestBatch(batch, apiKey);
    vectors.push(...batchVectors);
  }

  return vectors;
}
