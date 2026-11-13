import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { previewRewrite } from "@/lib/trails/edit";
import { parseChunkIds } from "@/lib/trails/edit-types";
import { trailErrorResponse } from "@/lib/trails/responses";
import { loadTrail } from "@/lib/trails/server";

// Claude may be asked for link reasons.
export const maxDuration = 60;

/**
 * Preview an insert, drop, or reorder. Body: { chunkIds } in the new order.
 * Returns the new connections with existing or suggested reasons to review.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("editing a trail");

  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as { chunkIds?: unknown } | null;
  const chunkIds = parseChunkIds(body?.chunkIds);

  if (!chunkIds) {
    return NextResponse.json({ error: "Send the new order as `chunkIds`." }, { status: 400 });
  }

  try {
    const trail = await loadTrail(auth.supabase, auth.userId, (await context.params).id);

    if (!trail) {
      return NextResponse.json({ error: "Trail not found." }, { status: 404 });
    }

    const preview = await previewRewrite(auth.supabase, trail, chunkIds);
    return NextResponse.json(preview);
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while preparing this edit.");
  }
}
