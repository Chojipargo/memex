import "server-only";

import type { TrailApi } from "@/lib/trails/api";
import type { RewritePair, RewriteStepInput } from "@/lib/trails/edit-types";
import {
  type LinkReasonPair,
  suggestLinkReasons,
  TrailGenerationError,
} from "@/lib/trails/generate";
import {
  loadTrail,
  type ServerSupabase,
  TrailError,
  trailSetupHint,
} from "@/lib/trails/server";

export const TRAIL_MAX_EDIT_STEPS = 40;

type Passage = { documentTitle: string; page: number; content: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstRelationship(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function pairKey(source: number, target: number): string {
  return `${source}>${target}`;
}

/** Reject an order that rewrite_trail would refuse, before calling Claude. */
export function validateOrder(chunkIds: ReadonlyArray<number>): void {
  if (chunkIds.length < 1 || chunkIds.length > TRAIL_MAX_EDIT_STEPS) {
    throw new TrailError(`A trail must have between 1 and ${TRAIL_MAX_EDIT_STEPS} steps.`, 400);
  }

  if (new Set(chunkIds).size !== chunkIds.length) {
    throw new TrailError("A passage can only appear once in a trail.", 400);
  }
}

/** Passages on the trail plus any the caller is adding, keyed by chunk id. */
async function loadPassages(
  supabase: ServerSupabase,
  trail: TrailApi,
  chunkIds: ReadonlyArray<number>,
): Promise<Map<number, Passage>> {
  const passages = new Map<number, Passage>(
    trail.steps.map((step) => [
      step.chunkId,
      { documentTitle: step.documentTitle, page: step.page, content: step.content },
    ]),
  );
  const missing = chunkIds.filter((id) => !passages.has(id));

  if (missing.length > 0) {
    const result = await supabase
      .from("chunks")
      .select("id, page, text, documents!inner(title)")
      .in("id", missing);

    if (result.error) {
      throw new TrailError(
        trailSetupHint(result.error.message, "editing trails") ?? "Could not load those passages.",
        503,
      );
    }

    for (const raw of result.data ?? []) {
      const row = asRecord(raw);
      const document = asRecord(firstRelationship(row?.documents));

      if (row && typeof row.id === "number" && typeof row.text === "string" && document) {
        passages.set(row.id, {
          documentTitle: typeof document.title === "string" ? document.title : "Untitled",
          page: typeof row.page === "number" ? row.page : 1,
          content: row.text,
        });
      }
    }
  }

  // RLS hides other users' passages, so a missing id is not found or not theirs.
  if (chunkIds.some((id) => !passages.has(id))) {
    throw new TrailError("One or more passages were not found in your library.", 404);
  }

  return passages;
}

/**
 * The connections a new order would create that the trail doesn't already
 * have, each with the existing link's reason or Claude's suggestion. The
 * reader reviews and edits these before the edit is applied.
 */
export async function previewRewrite(
  supabase: ServerSupabase,
  trail: TrailApi,
  chunkIds: ReadonlyArray<number>,
): Promise<{ pairs: RewritePair[]; suggestionError: string | null }> {
  validateOrder(chunkIds);

  const current = new Set<string>();

  for (let index = 1; index < trail.steps.length; index++) {
    current.add(pairKey(trail.steps[index - 1].chunkId, trail.steps[index].chunkId));
  }

  const candidates = chunkIds
    .map((target, index) => ({ position: index + 1, source: chunkIds[index - 1], target }))
    .filter((pair) => pair.position > 1 && !current.has(pairKey(pair.source, pair.target)));

  if (candidates.length === 0) {
    return { pairs: [], suggestionError: null };
  }

  const passages = await loadPassages(supabase, trail, chunkIds);
  const existing = new Map<string, { id: string; reason: string }>();
  const links = await supabase
    .from("links")
    .select("id, source_chunk_id, target_chunk_id, reason")
    .in("source_chunk_id", [...new Set(candidates.map((pair) => pair.source))]);

  if (links.error) {
    throw new TrailError(
      trailSetupHint(links.error.message, "editing trails") ?? "Could not load your links.",
      503,
    );
  }

  for (const raw of links.data ?? []) {
    const row = asRecord(raw);

    if (row && typeof row.id === "string" && typeof row.reason === "string") {
      existing.set(pairKey(Number(row.source_chunk_id), Number(row.target_chunk_id)), {
        id: row.id,
        reason: row.reason,
      });
    }
  }

  const needSuggestion = candidates.filter(
    (pair) => !existing.has(pairKey(pair.source, pair.target)),
  );
  let suggestions: string[] = needSuggestion.map(() => "");
  let suggestionError: string | null = null;

  try {
    const pairs: LinkReasonPair[] = needSuggestion.map((pair) => ({
      source: passages.get(pair.source)!,
      target: passages.get(pair.target)!,
    }));
    suggestions = await suggestLinkReasons(
      `A trail titled "${trail.title}", started from the question "${trail.question}".`,
      pairs,
    );
  } catch (error) {
    // The reader can still write the reasons; say why they're blank.
    suggestionError =
      error instanceof TrailGenerationError || error instanceof TrailError
        ? error.message
        : "Claude couldn't suggest reasons right now. Write them yourself, or try again.";
  }

  const suggestionFor = new Map(
    needSuggestion.map((pair, index) => [pairKey(pair.source, pair.target), suggestions[index] ?? ""]),
  );

  return {
    pairs: candidates.map((pair) => {
      const key = pairKey(pair.source, pair.target);
      const link = existing.get(key);
      const source = passages.get(pair.source)!;
      const target = passages.get(pair.target)!;

      return {
        position: pair.position,
        sourceChunkId: pair.source,
        targetChunkId: pair.target,
        sourceTitle: source.documentTitle,
        targetTitle: target.documentTitle,
        existingLinkId: link?.id ?? null,
        reason: link?.reason ?? suggestionFor.get(key) ?? "",
        suggested: !link && Boolean(suggestionFor.get(key)),
      };
    }),
    suggestionError,
  };
}

/** Apply a new order through rewrite_trail and return the reloaded trail. */
export async function applyRewrite(
  supabase: ServerSupabase,
  userId: string,
  trailId: string,
  expectedChunkIds: ReadonlyArray<number>,
  steps: ReadonlyArray<RewriteStepInput>,
): Promise<TrailApi> {
  validateOrder(steps.map((step) => step.chunkId));

  const result = await supabase.rpc("rewrite_trail", {
    p_trail_id: trailId,
    p_expected_chunk_ids: expectedChunkIds,
    p_steps: steps.map((step) => ({
      chunk_id: step.chunkId,
      ...(step.reason ? { reason: step.reason } : {}),
      reason_origin: step.reasonOrigin ?? "user",
    })),
  });

  if (result.error) {
    const message = result.error.message;

    if (/trail not found/i.test(message)) {
      throw new TrailError("Trail not found.", 404);
    }

    if (/changed since you opened it/i.test(message)) {
      throw new TrailError(message, 409);
    }

    if (/say why step|only appear once|not found in your library|between 1 and 40|limited to 1000/i.test(message)) {
      throw new TrailError(message, 400);
    }

    throw new TrailError(
      trailSetupHint(message, "editing trails") ?? "Could not save this edit.",
      503,
    );
  }

  const updated = await loadTrail(supabase, userId, trailId);

  if (!updated) {
    throw new TrailError("Trail not found.", 404);
  }

  return updated;
}
