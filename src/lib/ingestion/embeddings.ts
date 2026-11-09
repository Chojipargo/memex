import "server-only";

import { EMBEDDING_BATCH_SIZE } from "./constants";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = positiveInteger(
  process.env.EMBEDDING_DIMENSIONS,
  1536,
);

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
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
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

type EmbeddingRow = {
  index?: number;
  embedding?: number[];
};

type EmbeddingPayload = {
  data?: EmbeddingRow[];
  error?: { message?: string };
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestBatch(input: string[], apiKey: string): Promise<number[][]> {
  let lastError: EmbeddingError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input,
          encoding_format: "float",
          ...(EMBEDDING_MODEL.startsWith("text-embedding-3")
            ? { dimensions: EMBEDDING_DIMENSIONS }
            : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      lastError = new EmbeddingError(
        "Could not reach the embedding provider. Check the network and try again.",
      );

      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1));
      }

      continue;
    }

    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | EmbeddingPayload
        | null;
      const rows = payload?.data;

      if (!Array.isArray(rows) || rows.length !== input.length) {
        throw new EmbeddingError(
          "The embedding provider returned an unexpected response.",
        );
      }

      const ordered = [...rows].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );

      return ordered.map((row) => {
        const vector = row.embedding;

        if (
          !Array.isArray(vector) ||
          vector.length !== EMBEDDING_DIMENSIONS ||
          vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
        ) {
          throw new EmbeddingError(
            `Embedding dimensions must match vector(${EMBEDDING_DIMENSIONS}). ` +
              "Update EMBEDDING_DIMENSIONS and the database migration together.",
          );
        }

        return vector;
      });
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable) {
      if (response.status === 401 || response.status === 403) {
        throw new EmbeddingError(
          "The embedding provider rejected OPENAI_API_KEY. Check the key and try again.",
        );
      }

      throw new EmbeddingError(
        `The embedding request failed with status ${response.status}.`,
      );
    }

    lastError = new EmbeddingError(
      response.status === 429
        ? "The embedding provider is rate-limiting requests. Try again in a moment."
        : "The embedding provider is temporarily unavailable. Try again in a moment.",
    );

    if (attempt < MAX_ATTEMPTS) {
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw (
    lastError ??
    new EmbeddingError("The embedding request failed. Try again in a moment.")
  );
}

/**
 * Embed chunk text in batches of up to 64. Returns vectors in the same order as
 * the input so callers can zip them back onto their chunks.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new EmbeddingError(
      "OPENAI_API_KEY is not configured. Add it to .env.local to enable embeddings.",
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
