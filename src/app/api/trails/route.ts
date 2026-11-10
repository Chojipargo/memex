import { NextResponse } from "next/server";

import { EmbeddingError, isEmbeddingConfigured } from "@/lib/ingestion/embeddings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrailApi, TrailApiStep, TrailSummary } from "@/lib/trails/api";
import { generateTrail, TrailGenerationError } from "@/lib/trails/generate";
import {
  findCandidates,
  hasCoverage,
  LOW_COVERAGE_MESSAGE,
  makeExcerpt,
  TrailError,
  trailSetupHint,
} from "@/lib/trails/server";

export const maxDuration = 300;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseTrailSummaries(value: unknown): TrailSummary[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const trails: TrailSummary[] = [];

  for (const rawRow of value) {
    const row = asRecord(rawRow);
    const steps = row?.trail_steps;

    if (!row || !Array.isArray(steps)) {
      return null;
    }

    const id = asNonEmptyString(row.id);
    const title = asNonEmptyString(row.title);
    const question = asNonEmptyString(row.question);
    const createdAt = asNonEmptyString(row.created_at);

    if (!id || !title || !question || !createdAt) {
      return null;
    }

    trails.push({
      id,
      title,
      question,
      createdAt,
      stepCount: steps.length,
    });
  }

  return trails;
}

function errorResponse(error: unknown) {
  if (error instanceof TrailError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EmbeddingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof TrailGenerationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[trails]", error);

  return NextResponse.json(
    { error: "Something went wrong while building this trail. Try again." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
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
      { error: "You need to sign in before building a trail." },
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
      { error: "Send a question as JSON with a `question` field." },
      { status: 400 },
    );
  }

  const body = asRecord(payload);
  const question =
    body && typeof body.question === "string" ? body.question.trim() : "";

  if (question.length < 3) {
    return NextResponse.json(
      { error: "Ask a question with at least 3 characters." },
      { status: 400 },
    );
  }

  if (question.length > 500) {
    return NextResponse.json(
      { error: "Questions are limited to 500 characters." },
      { status: 400 },
    );
  }

  try {
    const candidates = await findCandidates(supabase, question, 30);

    // Skip the LLM entirely when nothing in the library is close enough.
    if (!hasCoverage(candidates)) {
      return NextResponse.json({ error: LOW_COVERAGE_MESSAGE }, { status: 422 });
    }

    const generated = await generateTrail(question, candidates);
    const steps = generated.steps.map((step) => ({
      chunk_id: step.chunkId,
      note: step.note,
    }));

    const saved = await supabase.rpc("create_generated_trail", {
      p_question: question,
      p_title: generated.title,
      p_model: generated.model,
      p_steps: steps,
    });

    if (saved.error) {
      throw new TrailError(
        trailSetupHint(saved.error.message, "building trails") ?? "Could not save the generated trail.",
        503,
      );
    }

    const trailId = asNonEmptyString(saved.data);

    if (!trailId) {
      throw new TrailError(
        "The trail service returned an unexpected response.",
        502,
      );
    }

    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.chunkId, candidate]),
    );
    const apiSteps: TrailApiStep[] = generated.steps.map((step, index) => {
      const candidate = candidatesById.get(step.chunkId);

      if (!candidate) {
        throw new TrailError(
          "The generated trail cited a passage outside your library.",
          502,
        );
      }

      return {
        position: index + 1,
        chunkId: step.chunkId,
        documentId: candidate.documentId,
        documentTitle: candidate.documentTitle,
        page: candidate.page,
        note: step.note,
        excerpt: makeExcerpt(candidate.content),
      };
    });

    const trail: TrailApi = {
      id: trailId,
      question,
      title: generated.title,
      model: generated.model,
      createdAt: new Date().toISOString(),
      steps: apiSteps,
    };

    return NextResponse.json({ trail }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
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
      { error: "You need to sign in before loading trails." },
      { status: 401 },
    );
  }

  try {
    const result = await supabase
      .from("trails")
      .select("id, title, question, created_at, trail_steps(id)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (result.error) {
      throw new TrailError(
        trailSetupHint(result.error.message, "loading trails") ?? "Could not load your trails.",
        503,
      );
    }

    const trails = parseTrailSummaries(result.data);

    if (!trails) {
      throw new TrailError(
        "The trail service returned an unexpected response.",
        502,
      );
    }

    return NextResponse.json({ trails });
  } catch (error) {
    return errorResponse(error);
  }
}
