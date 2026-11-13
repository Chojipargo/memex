import "server-only";

import type { TrailApi, TrailApiStep } from "@/lib/trails/api";
import type {
  GeneratedTrail,
  TrailStepDraft,
} from "@/lib/trails/generate";
import {
  buildApiStep,
  loadTrail,
  type MatchedChunk,
  type ServerSupabase,
  toRpcStep,
  TrailError,
  trailSetupHint,
} from "@/lib/trails/server";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sourceSteps(
  steps: ReadonlyArray<TrailStepDraft>,
  candidates: ReadonlyArray<MatchedChunk>,
) {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.chunkId, candidate]),
  );

  return steps.map((step) => {
    const candidate = candidatesById.get(step.chunkId);

    if (!candidate) {
      throw new TrailError(
        "The generated trail cited a passage that is no longer available.",
        502,
      );
    }

    return { step, candidate };
  });
}

/** Persist a generated trail and return the API shape the client renders. */
export async function createGeneratedTrail({
  supabase,
  userId,
  question,
  generated,
  candidates,
}: {
  supabase: ServerSupabase;
  userId: string;
  question: string;
  generated: GeneratedTrail;
  candidates: ReadonlyArray<MatchedChunk>;
}): Promise<TrailApi> {
  const sourced = sourceSteps(generated.steps, candidates);

  const saved = await supabase.rpc("create_generated_trail", {
    p_question: question,
    p_title: generated.title,
    p_model: generated.model,
    p_steps: sourced.map(({ step, candidate }) =>
      toRpcStep(step, candidate.content),
    ),
  });

  if (saved.error) {
    throw new TrailError(
      trailSetupHint(saved.error.message, "building trails") ??
        "Could not save the generated trail.",
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

  // Reload so each step carries its link. A connection that already existed
  // keeps its original reason, which may differ from the one just written.
  const savedTrail = await loadTrail(supabase, userId, trailId).catch(() => null);

  if (savedTrail) {
    return savedTrail;
  }

  const apiSteps: TrailApiStep[] = sourced.map(({ step, candidate }, index) =>
    buildApiStep(index + 1, step, candidate),
  );

  return {
    id: trailId,
    question,
    title: generated.title,
    model: generated.model,
    createdAt: new Date().toISOString(),
    steps: apiSteps,
  };
}

/** Append continuation steps and return the reloaded trail with provenance. */
export async function appendGeneratedTrail({
  supabase,
  userId,
  trail,
  steps,
  candidates,
}: {
  supabase: ServerSupabase;
  userId: string;
  trail: TrailApi;
  steps: TrailStepDraft[];
  candidates: ReadonlyArray<MatchedChunk>;
}): Promise<TrailApi> {
  const sourced = sourceSteps(steps, candidates);

  const appended = await supabase.rpc("append_generated_trail_steps", {
    p_trail_id: trail.id,
    p_steps: sourced.map(({ step, candidate }) =>
      toRpcStep(step, candidate.content),
    ),
  });

  if (appended.error) {
    throw new TrailError(
      trailSetupHint(appended.error.message, "continuing trails") ??
        "Could not save the new steps on this trail.",
      503,
    );
  }

  const updated = await loadTrail(supabase, userId, trail.id);

  if (!updated) {
    throw new TrailError("Trail not found.", 404);
  }

  return updated;
}
