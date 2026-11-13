import { NextResponse } from "next/server";

import { parsePassageBacklinks } from "@/lib/links/types";
import { asChunkId, requireUser } from "@/lib/supabase/require-user";
import { trailSetupHint } from "@/lib/trails/server";

/** Links tied to a passage (either direction) and the trails that pass through it. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("reading a passage");

  if (auth.error) {
    return auth.error;
  }

  const chunkId = asChunkId((await context.params).id);

  if (chunkId === null) {
    return NextResponse.json({ error: "Passage not found." }, { status: 404 });
  }

  const result = await auth.supabase.rpc("get_passage_backlinks", {
    p_chunk_id: chunkId,
  });

  if (result.error) {
    return NextResponse.json(
      {
        error:
          trailSetupHint(result.error.message, "reading links") ??
          "Could not load what this passage is tied to.",
      },
      { status: 503 },
    );
  }

  // Null means the passage doesn't exist or isn't the caller's.
  if (result.data === null) {
    return NextResponse.json({ error: "Passage not found." }, { status: 404 });
  }

  const backlinks = parsePassageBacklinks(result.data);

  if (!backlinks) {
    return NextResponse.json(
      { error: "The link service returned an unexpected response." },
      { status: 502 },
    );
  }

  return NextResponse.json(backlinks);
}
