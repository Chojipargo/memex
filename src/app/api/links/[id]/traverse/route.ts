import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { TRAIL_UUID_PATTERN } from "@/lib/trails/server";

/** Record that the reader followed a link, strengthening it. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("following links");

  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;

  if (!TRAIL_UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  const result = await auth.supabase.rpc("record_link_traversal", { p_link_id: id });

  if (result.error) {
    return NextResponse.json({ error: "Could not record this step." }, { status: 503 });
  }

  if (result.data === null) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }

  return NextResponse.json({ traversalCount: result.data });
}
