import type {
  ProgressStage,
  SourceOrigin,
  TrailProgress,
} from "@/lib/rag/types";
import { TRAIL_CLIENT_TIMEOUT_MS } from "@/lib/trails/timeouts";

export type TrailApiStep = {
  position: number;
  chunkId: number;
  documentId: string;
  documentTitle: string;
  page: number;
  note: string;
  /** AI summary of the passage (label it as such in the UI). */
  gist: string | null;
  /** Verified verbatim key quote from `content`, or null. */
  quote: string | null;
  /** Full chunk text. */
  content: string;
  /** First ~280 characters of the chunk, kept for backward compatibility. */
  excerpt: string;
  /** Personal library or web research. Older API responses default to library. */
  sourceOrigin: SourceOrigin;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceProvider: string | null;
  retrievedAt: string | null;
};

export type TrailApi = {
  id: string;
  question: string;
  title: string;
  model: string;
  createdAt: string;
  steps: TrailApiStep[];
};

export type TrailSummary = {
  id: string;
  title: string;
  question: string;
  createdAt: string;
  stepCount: number;
};

export type TrailRequestMode = "auto" | "research";

export type TrailQuestionInput = {
  question: string;
  mode?: TrailRequestMode;
  /** Optional URL for manual research mode. */
  url?: string | null;
};

export type TrailQuestionOptions = {
  onProgress?: (progress: TrailProgress) => void;
};

export type TrailQuestionResult =
  | { ok: true; trail: TrailApi }
  | { ok: false; message: string; lowCoverage: boolean };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** string → trimmed string or null; null → null; anything else → undefined (invalid). */
function asNullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || null;
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

function parseStage(value: unknown): ProgressStage | null {
  return value === "searching" ||
    value === "researching" ||
    value === "weaving"
    ? value
    : null;
}

function parseStep(value: unknown): TrailApiStep | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const position = asInteger(record.position, 1);
  const chunkId = asInteger(record.chunkId, 1);
  const documentId = asNonEmptyString(record.documentId);
  const documentTitle = asNonEmptyString(record.documentTitle);
  const page = asInteger(record.page, 1);
  const note = asString(record.note);
  const excerpt = asString(record.excerpt);
  const content = asString(record.content);
  const gist = asNullableString(record.gist);
  const quote = asNullableString(record.quote);
  const sourceUrl = asNullableString(record.sourceUrl);
  const sourceDomain = asNullableString(record.sourceDomain);
  const sourceProvider = asNullableString(record.sourceProvider);
  const retrievedAt = asNullableString(record.retrievedAt);

  if (
    position === null ||
    chunkId === null ||
    !documentId ||
    !documentTitle ||
    page === null ||
    note === null ||
    excerpt === null ||
    content === null ||
    gist === undefined ||
    quote === undefined ||
    sourceUrl === undefined ||
    sourceDomain === undefined ||
    sourceProvider === undefined ||
    retrievedAt === undefined
  ) {
    return null;
  }

  return {
    position,
    chunkId,
    documentId,
    documentTitle,
    page,
    note,
    gist,
    quote,
    content,
    excerpt,
    sourceOrigin: parseOrigin(record.sourceOrigin),
    sourceUrl,
    sourceDomain,
    sourceProvider,
    retrievedAt,
  };
}

export function parseTrailApiResponse(value: unknown): TrailApi | null {
  const root = asRecord(value);
  const trail = root ? asRecord(root.trail) : null;

  if (!trail) {
    return null;
  }

  const id = asNonEmptyString(trail.id);
  const question = asNonEmptyString(trail.question);
  const title = asNonEmptyString(trail.title);
  const model = asNonEmptyString(trail.model);
  const createdAt = asNonEmptyString(trail.createdAt);
  const rawSteps = trail.steps;

  if (
    !id ||
    !question ||
    !title ||
    !model ||
    !createdAt ||
    !Array.isArray(rawSteps)
  ) {
    return null;
  }

  const steps: TrailApiStep[] = [];

  for (const rawStep of rawSteps) {
    const step = parseStep(rawStep);

    if (!step) {
      return null;
    }

    steps.push(step);
  }

  return { id, question, title, model, createdAt, steps };
}

export function readApiError(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  return asNonEmptyString(record.error);
}

/** The server decides when "upload a source" is the right suggestion. */
function readLowCoverage(value: unknown): boolean {
  return asRecord(value)?.lowCoverage === true;
}

function errorResult(
  message: string,
  lowCoverage: boolean,
): TrailQuestionResult {
  return { ok: false, message, lowCoverage };
}

function requestBody(input: string | TrailQuestionInput) {
  if (typeof input === "string") {
    return { question: input };
  }

  return {
    question: input.question,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.url ? { url: input.url } : {}),
  };
}

/** Parse one NDJSON event emitted by the trail routes. */
function parseStreamEvent(
  value: unknown,
  options: TrailQuestionOptions,
): TrailQuestionResult | null {
  const event = asRecord(value);

  if (!event) {
    return null;
  }

  if (event.type === "status") {
    const stage = parseStage(event.stage);
    const message = asNonEmptyString(event.message);

    if (stage && message) {
      options.onProgress?.({ stage, message });
    }

    return null;
  }

  if (event.type === "trail") {
    const trail = parseTrailApiResponse({ trail: event.trail });

    return trail
      ? { ok: true, trail }
      : errorResult(
          "The trail came back in an unexpected shape. Try again.",
          false,
        );
  }

  if (event.type === "error") {
    return errorResult(
      asNonEmptyString(event.error) ??
        "The request failed. Try again in a moment.",
      event.lowCoverage === true,
    );
  }

  return null;
}

async function readNdjson(
  response: Response,
  options: TrailQuestionOptions,
): Promise<TrailQuestionResult> {
  if (!response.body) {
    return errorResult("The server returned an empty response.", false);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (line: string): TrailQuestionResult | null => {
    const trimmed = line.trim();

    if (!trimmed) {
      return null;
    }

    try {
      return parseStreamEvent(JSON.parse(trimmed) as unknown, options);
    } catch {
      return null;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");

      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const result = consume(line);

        if (result) {
          await reader.cancel();
          return result;
        }

        newline = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    const result = consume(buffer);

    return result ?? errorResult("The trail stream ended unexpectedly.", false);
  } catch {
    return errorResult(
      "The trail connection was interrupted. Try again.",
      false,
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * POST a question to a trail endpoint (`/api/trails` or
 * `/api/trails/:id/continue`). Routes may stream NDJSON progress events and a
 * final trail, or return one JSON payload.
 */
export async function postTrailQuestion(
  url: string,
  input: string | TrailQuestionInput,
  options: TrailQuestionOptions = {},
): Promise<TrailQuestionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TRAIL_CLIENT_TIMEOUT_MS,
  );
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json",
      },
      body: JSON.stringify(requestBody(input)),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);

    return errorResult(
      controller.signal.aborted
        ? "The trail request took too long and was stopped. Try again with a shorter question."
        : "Could not reach the server. Check your connection and try again.",
      false,
    );
  }

  try {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/x-ndjson")) {
      return await readNdjson(response, options);
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return errorResult(
        readApiError(payload) ??
          `The request failed (${response.status}). Try again.`,
        readLowCoverage(payload),
      );
    }

    const trail = parseTrailApiResponse(payload);

    return trail
      ? { ok: true, trail }
      : errorResult(
          "The trail came back in an unexpected shape. Try again.",
          false,
        );
  } catch {
    return errorResult(
      controller.signal.aborted
        ? "The trail request took too long and was stopped. Try again with a shorter question."
        : "The trail response could not be read. Try again.",
      false,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Re-exported for callers that render progress without importing rag types. */
export type { ProgressStage, TrailProgress };
