import { NextResponse } from "next/server";

import { isEmbeddingConfigured } from "@/lib/ingestion/embeddings";
import { buildHybridTrail } from "@/lib/rag/pipeline";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrailSummary } from "@/lib/trails/api";
import { createGeneratedTrail } from "@/lib/trails/persist";
import {
  createTrailStreamResponse,
  trailErrorResponse,
} from "@/lib/trails/responses";
import { TrailError, trailSetupHint } from "@/lib/trails/server";

// Keep in sync with TRAIL_MAX_DURATION_SECONDS in lib/trails/timeouts.ts.
export const maxDuration = 60;

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
      { error: "Send a question as JSON with a `question` field." },
      { status: 400 },
    );
  }

  const body = asRecord(payload);
  const rawQuestion =
    body && typeof body.question === "string" ? body.question.trim() : "";
  const mode = body?.mode === "research" ? "research" : "auto";
  const rawUrl = body && typeof body.url === "string" ? body.url.trim() : "";

  if (rawUrl.length > 2000) {
    return NextResponse.json(
      { error: "URLs are limited to 2000 characters." },
      { status: 400 },
    );
  }

  const question = (
    rawQuestion || (rawUrl ? `Research this source: ${rawUrl}` : "")
  ).slice(0, 1000);

  if (question.length < 3) {
    return NextResponse.json(
      { error: "Ask a question with at least 3 characters." },
      { status: 400 },
    );
  }

  if (question.length > 500 && !rawUrl) {
    return NextResponse.json(
      { error: "Questions are limited to 500 characters." },
      { status: 400 },
    );
  }

  return createTrailStreamResponse(
    async (onProgress) => {
      const result = await buildHybridTrail({
        supabase,
        userId: user.id,
        question,
        mode,
        url: rawUrl || null,
        onProgress,
      });

      return createGeneratedTrail({
        supabase,
        question,
        generated: result.generated,
        candidates: result.candidates,
      });
    },
    "Something went wrong while building this trail. Try again.",
  );
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
    return trailErrorResponse(
      error,
      "Something went wrong while loading your trails. Try again.",
    );
  }
}
