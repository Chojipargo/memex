import { NextResponse } from "next/server";

import { LINK_REASON_MAX_CHARS } from "@/lib/links/types";
import { asChunkId, requireUser } from "@/lib/supabase/require-user";
import { trailSetupHint } from "@/lib/trails/server";

/** Link two of your passages by hand. Body: { sourceChunkId, targetChunkId, reason }. */
export async function POST(request: Request) {
  const auth = await requireUser("linking passages");

  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sourceChunkId = asChunkId(body?.sourceChunkId);
  const targetChunkId = asChunkId(body?.targetChunkId);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (sourceChunkId === null || targetChunkId === null || sourceChunkId === targetChunkId) {
    return NextResponse.json(
      { error: "Choose two different passages to link." },
      { status: 400 },
    );
  }

  if (!reason || reason.length > LINK_REASON_MAX_CHARS) {
    return NextResponse.json(
      { error: `Say why they connect, in up to ${LINK_REASON_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  const result = await auth.supabase.rpc("create_user_link", {
    p_source_chunk_id: sourceChunkId,
    p_target_chunk_id: targetChunkId,
    p_reason: reason,
  });

  if (result.error) {
    const notFound = /not found in your library/i.test(result.error.message);

    return NextResponse.json(
      {
        error: notFound
          ? "One of those passages isn't in your library."
          : (trailSetupHint(result.error.message, "linking passages") ??
            "Could not save this link."),
      },
      { status: notFound ? 404 : 503 },
    );
  }

  return NextResponse.json({ linkId: result.data }, { status: 201 });
}
