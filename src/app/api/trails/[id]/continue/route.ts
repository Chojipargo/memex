import { NextResponse } from "next/server";

import { EmbeddingError, isEmbeddingConfigured } from "@/lib/ingestion/embeddings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { continueTrail, TrailGenerationError } from "@/lib/trails/generate";
import {
  findCandidates,
  hasCoverage,
  loadTrail,
  LOW_COVERAGE_MESSAGE,
  TrailError,
  trailSetupHint,
} from "@/lib/trails/server";

export const maxDuration = 300;

const QUESTION_MIN_CHARS = 3;
const QUESTION_MAX_CHARS = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorResponse(error: unknown) {
  if (
    error instanceof TrailError ||
    error instanceof EmbeddingError ||
    error instanceof TrailGenerationError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[trails/:id/continue]", error);

  return NextResponse.json(
    { error: "Something went wrong while continuing this trail. Try again." },
    { status: 500 },
  );
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
          "GEMINI_API_KEY is not configured. Add it to .env.local to generate trails.",
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

  try {
    const trail = await loadTrail(supabase, user.id, id);

    if (!trail) {
      return NextResponse.json({ error: "Trail not found." }, { status: 404 });
    }

    const lastStep = trail.steps.at(-1);
    const existingChunkIds = new Set(trail.steps.map((step) => step.chunkId));

    // Anchor retrieval on where the trail currently ends so the continuation
    // stays connected to it, not only to the follow-up question.
    const retrievalQuery = lastStep
      ? `${question}\n\n${lastStep.note}\n\n${lastStep.excerpt}`
      : question;

    const candidates = await findCandidates(
      supabase,
      retrievalQuery,
      30,
      existingChunkIds,
    );

    if (!hasCoverage(candidates)) {
      return NextResponse.json({ error: LOW_COVERAGE_MESSAGE }, { status: 422 });
    }

    const continued = await continueTrail(trail, question, candidates);

    const appended = await supabase.rpc("append_generated_trail_steps", {
      p_trail_id: trail.id,
      p_steps: continued.steps.map((step) => ({
        chunk_id: step.chunkId,
        note: step.note,
      })),
    });

    if (appended.error) {
      throw new TrailError(
        trailSetupHint(appended.error.message, "continuing trails") ??
          "Could not save the new steps on this trail.",
        503,
      );
    }

    const updated = await loadTrail(supabase, user.id, trail.id);

    if (!updated) {
      return NextResponse.json({ error: "Trail not found." }, { status: 404 });
    }

    return NextResponse.json({ trail: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
