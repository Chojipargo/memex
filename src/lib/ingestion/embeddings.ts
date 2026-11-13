import "server-only";

import { EMBEDDING_BATCH_SIZE } from "./constants";
import { EmbeddingCache } from "./embedding-cache";
import { type RateLimitInfo, readRateLimitInfo, retryDelayMs } from "./rate-limit";

export const EMBEDDING_MODEL = normalizeModelName(
  process.env.GEMINI_EMBEDDING_MODEL,
);

export const EMBEDDING_DIMENSIONS = positiveInteger(
  process.env.EMBEDDING_DIMENSIONS,
  1536,
);

const GEMINI_EMBEDDINGS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;
/** Longest a background call (uploads, notes) waits out a rate limit per retry. */
const DEFAULT_MAX_RETRY_WAIT_MS = 30_000;

/**
 * Query embeddings (questions, searches, trail themes) repeat often and are
 * cheap to keep, so they're cached in server memory instead of re-requested.
 */
const queryCache = new EmbeddingCache();

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
const DEFAULT_EMBEDDING_TASK_TYPE: EmbeddingTaskType = "RETRIEVAL_DOCUMENT";

/** Per-call overrides so request-scoped routes can use a tighter budget. */
export type EmbeddingOptions = {
  /** Timeout for one HTTP attempt. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Total attempts, including the first. Defaults to 3. */
  maxAttempts?: number;
  /**
   * Longest wait before a retry. When Gemini asks us to wait longer than
   * this, fail straight away with a message saying how long. Defaults to 30s.
   */
  maxRetryWaitMs?: number;
};

export class EmbeddingError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "EmbeddingError";
    this.status = status;
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

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
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

async function requestBatch(
  input: string[],
  apiKey: string,
  taskType: EmbeddingTaskType,
  options: EmbeddingOptions = {},
): Promise<number[][]> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS);
  const maxRetryWaitMs = options.maxRetryWaitMs ?? DEFAULT_MAX_RETRY_WAIT_MS;
  let lastError: EmbeddingError | null = null;

  // gemini-embedding-2 rejects `taskType`; it expects task instructions in the
  // prompt instead. The default gemini-embedding-001 uses the structured field.
  const supportsTaskType = !EMBEDDING_MODEL.startsWith("gemini-embedding-2");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
              ...(supportsTaskType ? { taskType } : {}),
              outputDimensionality: EMBEDDING_DIMENSIONS,
            })),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      const timedOut = isTimeoutError(error);

      lastError = new EmbeddingError(
        timedOut
          ? "The Gemini embedding provider timed out. Try again in a moment."
          : "Could not reach the Gemini embedding provider. Check the network and try again.",
        timedOut ? 504 : 502,
      );

      if (attempt < maxAttempts) {
        await sleep(retryDelayMs(attempt, null));
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

    if (response.status === 429) {
      const info = readRateLimitInfo(payload, response.headers.get("retry-after"));

      // Retrying can't beat a daily quota; say what will.
      if (info.daily) {
        throw new EmbeddingError(
          "Gemini's daily limit for GEMINI_API_KEY is used up, so questions can't be searched until it resets (usually midnight Pacific time). Enabling billing on the key's Google Cloud project raises the limit.",
          429,
        );
      }

      const wait = retryDelayMs(attempt, info);
      lastError = rateLimitedError(info);

      if (attempt < maxAttempts && wait <= maxRetryWaitMs) {
        await sleep(wait);
      } else {
        // Waiting longer than this call can afford: fail now with the delay.
        throw lastError;
      }

      continue;
    }

    lastError = new EmbeddingError(
      "The Gemini embedding provider is temporarily unavailable. Try again in a moment.",
    );

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs(attempt, null));
    }
  }

  throw (
    lastError ??
    new EmbeddingError(
      "The Gemini embedding request failed. Try again in a moment.",
    )
  );
}

function rateLimitedError(info: RateLimitInfo): EmbeddingError {
  const seconds =
    info.retryAfterMs !== null ? Math.max(1, Math.ceil(info.retryAfterMs / 1000)) : null;

  return new EmbeddingError(
    seconds !== null
      ? `Gemini's per-minute limit for GEMINI_API_KEY was reached. Try again in about ${seconds} second${seconds === 1 ? "" : "s"}.`
      : "Gemini's per-minute limit for GEMINI_API_KEY was reached. Try again in a minute.",
    429,
  );
}

function cacheKey(taskType: EmbeddingTaskType, text: string): string {
  return `${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:${taskType}:${text}`;
}

/**
 * Embed chunk text with Gemini in batches of up to 64. Returns vectors in the
 * same order as the input so callers can zip them back onto their chunks.
 * Query embeddings are served from an in-memory cache when possible.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType = DEFAULT_EMBEDDING_TASK_TYPE,
  options: EmbeddingOptions = {},
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new EmbeddingError(
      "GEMINI_API_KEY is not configured. Add it to .env.local to enable embeddings.",
    );
  }

  const cacheable = taskType === "RETRIEVAL_QUERY";
  const vectors: (number[] | null)[] = texts.map((text) =>
    cacheable ? queryCache.get(cacheKey(taskType, text)) : null,
  );
  const missing = texts
    .map((text, index) => ({ text, index }))
    .filter((item) => vectors[item.index] === null);

  for (let start = 0; start < missing.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = missing.slice(start, start + EMBEDDING_BATCH_SIZE);
    const batchVectors = await requestBatch(
      batch.map((item) => item.text),
      apiKey,
      taskType,
      options,
    );

    batch.forEach((item, offset) => {
      vectors[item.index] = batchVectors[offset];

      if (cacheable) {
        queryCache.set(cacheKey(taskType, item.text), batchVectors[offset]);
      }
    });
  }

  return vectors as number[][];
}
