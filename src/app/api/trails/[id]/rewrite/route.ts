import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { applyRewrite } from "@/lib/trails/edit";
import { parseChunkIds, parseRewriteSteps } from "@/lib/trails/edit-types";
import { trailErrorResponse } from "@/lib/trails/responses";
import { TRAIL_UUID_PATTERN } from "@/lib/trails/server";

/**
 * Apply an insert, drop, or reorder.
 * Body: { expectedChunkIds, steps: [{ chunkId, reason?, reasonOrigin? }] }.
 * Refused with 409 if the trail changed since the caller loaded it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("editing a trail");

  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;

  if (!TRAIL_UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Trail not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    expectedChunkIds?: unknown;
    steps?: unknown;
  } | null;
  const expectedChunkIds = parseChunkIds(body?.expectedChunkIds);
  const steps = parseRewriteSteps(body?.steps);

  if (!expectedChunkIds || !steps) {
    return NextResponse.json(
      { error: "Send `expectedChunkIds` and the new `steps`." },
      { status: 400 },
    );
  }

  try {
    const trail = await applyRewrite(auth.supabase, auth.userId, id, expectedChunkIds, steps);
    return NextResponse.json({ trail });
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while saving this edit.");
  }
}
