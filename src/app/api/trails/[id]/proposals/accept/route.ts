import { NextResponse } from "next/server";

import { LINK_REASON_MAX_CHARS } from "@/lib/links/types";
import { asChunkId, requireUser } from "@/lib/supabase/require-user";
import { TRAIL_GIST_MAX_CHARS } from "@/lib/trails/generate";
import { locateQuote } from "@/lib/trails/quote";
import { trailErrorResponse } from "@/lib/trails/responses";
import {
  loadTrail,
  toRpcStep,
  TrailError,
  trailSetupHint,
} from "@/lib/trails/server";

/**
 * Continue a trail with a proposed next step.
 * Body: { fromChunkId, chunkId, reason, reasonEdited, gist?, quote? }.
 *
 * The link from the current last step is saved as claude_accepted, or as the
 * reader's own (user) when they reworded the reason. fromChunkId guards
 * against the trail having moved on since the proposals were made.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("continuing a trail");

  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fromChunkId = asChunkId(body?.fromChunkId);
  const chunkId = asChunkId(body?.chunkId);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const reasonEdited = body?.reasonEdited === true;
  const gist =
    typeof body?.gist === "string" && body.gist.trim()
      ? body.gist.trim().slice(0, TRAIL_GIST_MAX_CHARS)
      : null;
  const quote = typeof body?.quote === "string" ? body.quote : "";

  if (fromChunkId === null || chunkId === null) {
    return NextResponse.json({ error: "Choose a passage to continue with." }, { status: 400 });
  }

  if (!reason || reason.length > LINK_REASON_MAX_CHARS) {
    return NextResponse.json(
      { error: `Say why it follows, in up to ${LINK_REASON_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const trailId = (await context.params).id;
    const trail = await loadTrail(auth.supabase, auth.userId, trailId);

    if (!trail) {
      return NextResponse.json({ error: "Trail not found." }, { status: 404 });
    }

    if (trail.steps.at(-1)?.chunkId !== fromChunkId) {
      throw new TrailError("This trail changed since these suggestions were made. Ask again.", 409);
    }

    if (trail.steps.some((step) => step.chunkId === chunkId)) {
      throw new TrailError("That passage is already on this trail.", 400);
    }

    const chunk = await auth.supabase
      .from("chunks")
      .select("id, text")
      .eq("id", chunkId)
      .maybeSingle();

    if (chunk.error) {
      throw new TrailError(
        trailSetupHint(chunk.error.message, "continuing trails") ?? "Could not load that passage.",
        503,
      );
    }

    const content = (chunk.data as { text?: unknown } | null)?.text;

    if (typeof content !== "string") {
      throw new TrailError("That passage isn't in your library.", 404);
    }

    // The quote is re-located server-side; one that isn't in the passage is dropped.
    const step = toRpcStep(
      { chunkId, note: reason, gist, quote: quote ? locateQuote(content, quote) : null },
      content,
    );
    const appended = await auth.supabase.rpc("append_generated_trail_steps", {
      p_trail_id: trail.id,
      p_steps: [step],
    });

    if (appended.error) {
      throw new TrailError(
        trailSetupHint(appended.error.message, "continuing trails") ??
          "Could not add this step.",
        503,
      );
    }

    // A reworded reason makes the link the reader's own. This also re-words
    // an existing link between the two passages.
    if (reasonEdited) {
      const link = await auth.supabase.rpc("create_user_link", {
        p_source_chunk_id: fromChunkId,
        p_target_chunk_id: chunkId,
        p_reason: reason,
      });

      if (link.error) {
        console.error("[trails/:id/proposals/accept] reword failed", link.error.message);
      }
    }

    const updated = await loadTrail(auth.supabase, auth.userId, trail.id);

    if (!updated) {
      throw new TrailError("Trail not found.", 404);
    }

    return NextResponse.json({ trail: updated });
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while adding this step.");
  }
}
