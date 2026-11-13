import { NextResponse } from "next/server";

import { isEmbeddingConfigured } from "@/lib/ingestion/embeddings";
import { buildNextStepProposals } from "@/lib/rag/pipeline";
import { requireUser } from "@/lib/supabase/require-user";
import type { NextStepProposal } from "@/lib/trails/proposal-types";
import { trailErrorResponse } from "@/lib/trails/responses";
import { loadTrail, makeExcerpt, TrailError } from "@/lib/trails/server";

// Keep in sync with TRAIL_MAX_DURATION_SECONDS in lib/trails/timeouts.ts.
export const maxDuration = 60;

const QUESTION_MAX_CHARS = 500;

/**
 * Suggest next steps from where a trail ends. Body: { question? }. Without a
 * question, suggestions follow the trail's theme. Nothing is saved.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("continuing a trail");

  if (auth.error) {
    return auth.error;
  }

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured, so next steps can't be suggested." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";

  if (question.length > QUESTION_MAX_CHARS) {
    return NextResponse.json(
      { error: `Questions are limited to ${QUESTION_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const trail = await loadTrail(auth.supabase, auth.userId, (await context.params).id);

    if (!trail) {
      return NextResponse.json({ error: "Trail not found." }, { status: 404 });
    }

    const { proposals, candidates } = await buildNextStepProposals({
      supabase: auth.supabase,
      trail,
      question: question.length >= 3 ? question : null,
    });
    const lastChunkId = trail.steps.at(-1)!.chunkId;
    const byChunk = new Map(candidates.map((candidate) => [candidate.chunkId, candidate]));

    // Where the passages are already linked, show that link's reason: it is
    // the one the trail will use.
    const links = await auth.supabase
      .from("links")
      .select("target_chunk_id, reason")
      .eq("source_chunk_id", lastChunkId)
      .in(
        "target_chunk_id",
        proposals.steps.map((step) => step.chunkId),
      );

    if (links.error) {
      throw new TrailError("Could not load your links.", 503);
    }

    const existing = new Map(
      (links.data ?? []).map((row) => [Number(row.target_chunk_id), String(row.reason)]),
    );

    const result: NextStepProposal[] = proposals.steps.flatMap((step) => {
      const candidate = byChunk.get(step.chunkId);

      if (!candidate) {
        return [];
      }

      const existingReason = existing.get(step.chunkId);

      return [
        {
          chunkId: step.chunkId,
          documentTitle: candidate.documentTitle,
          page: candidate.page,
          excerpt: makeExcerpt(candidate.content),
          sourceOrigin: candidate.sourceOrigin ?? "library",
          sourceDomain: candidate.sourceDomain ?? null,
          reason: existingReason ?? step.note,
          existingLink: existingReason !== undefined,
          gist: step.gist,
          quote: step.quote ? candidate.content.slice(step.quote.start, step.quote.end) : null,
        },
      ];
    });

    return NextResponse.json({ proposals: result, fromChunkId: lastChunkId });
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while suggesting next steps.");
  }
}
