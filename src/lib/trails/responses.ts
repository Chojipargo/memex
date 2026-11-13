import "server-only";

import { NextResponse } from "next/server";

import { EmbeddingError } from "@/lib/ingestion/embeddings";
import { SourceIngestError } from "@/lib/rag/ingest";
import { HybridTrailError } from "@/lib/rag/pipeline";
import type { TrailProgress } from "@/lib/rag/types";
import { WebSearchError } from "@/lib/rag/web";
import type { TrailApi } from "@/lib/trails/api";
import { TrailGenerationError } from "@/lib/trails/generate";
import { TrailError, trailSetupHint } from "@/lib/trails/server";

export type TrailErrorPayload = {
  error: string;
  status: number;
  lowCoverage: boolean;
};

export type TrailStreamEvent =
  | ({ type: "status" } & TrailProgress)
  | { type: "trail"; trail: TrailApi }
  | ({ type: "error" } & TrailErrorPayload);

function hasStatus(error: unknown): error is { status: number; message: string } {
  return (
    error instanceof Error &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

/**
 * True only when the request can be fixed by adding a source or researching
 * the web: an empty or non-covering library. Bad URLs, empty web results, and
 * provider failures are 422s too, but those prompts don't help there.
 */
function isLowCoverage(error: unknown): boolean {
  if (error instanceof HybridTrailError) {
    return error.lowCoverage;
  }

  // "There are no passages to build a trail from" and its continuation twin.
  return error instanceof TrailGenerationError && error.status === 422;
}

/**
 * Postgres and PostgREST wording for objects a migration creates. Matched
 * against database errors only, so a message that merely mentions a "column"
 * is not mistaken for a missing migration.
 */
const MISSING_SCHEMA =
  /\b(?:column|relation|function)\b[\s\S]*?\bdoes not exist\b|could not find the (?:function|table)\b|could not find the '[^']+' column/i;

function isMissingSchema(error: unknown): boolean {
  return (
    (error instanceof TrailError || error instanceof SourceIngestError) &&
    MISSING_SCHEMA.test(error.message)
  );
}

function setupHint(message: string): string {
  return (
    trailSetupHint(message, "using hybrid research") ??
    "The hybrid RAG migration is missing. Apply supabase/migrations/20261111120000_hybrid_rag.sql, then try again."
  );
}

/**
 * Map every known research/trail failure into one payload shape. Unknown
 * errors are logged and reported without leaking internals.
 */
export function toTrailErrorPayload(
  error: unknown,
  fallbackMessage: string,
): TrailErrorPayload {
  if (
    error instanceof TrailError ||
    error instanceof EmbeddingError ||
    error instanceof TrailGenerationError ||
    error instanceof WebSearchError ||
    error instanceof SourceIngestError ||
    error instanceof HybridTrailError
  ) {
    return {
      error: error.message,
      status: error.status,
      lowCoverage: isLowCoverage(error),
    };
  }

  if (hasStatus(error)) {
    return {
      error: error.message,
      status: error.status,
      lowCoverage: false,
    };
  }

  console.error("[trails]", error);

  return {
    error: fallbackMessage,
    status: 500,
    lowCoverage: false,
  };
}

function setupHintPayload(
  error: unknown,
  fallbackMessage: string,
): TrailErrorPayload {
  const payload = toTrailErrorPayload(error, fallbackMessage);

  if (isMissingSchema(error)) {
    return { ...payload, error: setupHint(payload.error), status: 503 };
  }

  return payload;
}

export function trailErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  const payload = setupHintPayload(error, fallbackMessage);

  return NextResponse.json(payload, { status: payload.status });
}

/**
 * Stream progress as NDJSON, then one final trail (or error) event. Keeping
 * status events out-of-band from the trail payload lets the UI show real
 * server phases rather than guessing with timers.
 */
export function createTrailStreamResponse(
  run: (onProgress: (progress: TrailProgress) => void) => Promise<TrailApi>,
  fallbackMessage: string,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TrailStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const trail = await run((progress) => {
          send({ type: "status", ...progress });
        });

        send({ type: "trail", trail });
      } catch (error) {
        send({
          type: "error",
          ...setupHintPayload(error, fallbackMessage),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Accel-Buffering": "no",
    },
  });
}
