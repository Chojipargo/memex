import { NextResponse } from "next/server";

import { isEmbeddingConfigured } from "@/lib/ingestion/embeddings";
import { buildHybridContinuation } from "@/lib/rag/pipeline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrailApi } from "@/lib/trails/api";
import { appendGeneratedTrail } from "@/lib/trails/persist";
import {
  createTrailStreamResponse,
  trailErrorResponse,
} from "@/lib/trails/responses";
import { loadTrail } from "@/lib/trails/server";

// Keep in sync with TRAIL_MAX_DURATION_SECONDS in lib/trails/timeouts.ts.
export const maxDuration = 60;

const QUESTION_MIN_CHARS = 3;
const QUESTION_MAX_CHARS = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add the URL and anon key to .env.local.",
      },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in before continuing a trail." },
      { status: 401 },
    );
  }

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not configured. Add it to .env.local to search your library for trails.",
      },
      { status: 503 },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send a follow-up as JSON with a `question` field." },
      { status: 400 },
    );
  }

  const body = asRecord(payload);
  const question =
    body && typeof body.question === "string" ? body.question.trim() : "";

  if (question.length < QUESTION_MIN_CHARS) {
    return NextResponse.json(
      { error: "Ask a question with at least 3 characters." },
      { status: 400 },
    );
  }

  if (question.length > QUESTION_MAX_CHARS) {
    return NextResponse.json(
      { error: "Questions are limited to 500 characters." },
      { status: 400 },
    );
  }

  const { id } = await context.params;

  let trail: TrailApi | null;

  try {
    trail = await loadTrail(supabase, user.id, id);
  } catch (error) {
    return trailErrorResponse(
      error,
      "Something went wrong while loading this trail. Try again.",
    );
  }

  if (!trail) {
    return NextResponse.json({ error: "Trail not found." }, { status: 404 });
  }

  return createTrailStreamResponse(
    async (onProgress) => {
      const result = await buildHybridContinuation({
        supabase,
        userId: user.id,
        trail,
        question,
        onProgress,
      });

      return appendGeneratedTrail({
        supabase,
        userId: user.id,
        trail,
        steps: result.continued.steps,
        candidates: result.candidates,
      });
    },
    "Something went wrong while continuing this trail. Try again.",
  );
}
