import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TRAIL_UUID_PATTERN } from "@/lib/trails/server";

/**
 * Count the signed-in reader as a learner of a published trail (once per
 * reader; authors and signed-out visitors are not counted).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ counted: false }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ counted: false });
  }

  const { id } = await context.params;

  if (!TRAIL_UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Trail not found." }, { status: 404 });
  }

  const result = await supabase.rpc("record_trail_learner", { p_published_id: id });

  if (result.error) {
    const notFound = /not found/i.test(result.error.message);

    if (!notFound) {
      console.error("[explore/:id/learn]", result.error.message);
    }

    return NextResponse.json(
      { error: notFound ? "Trail not found." : "Could not record this visit." },
      { status: notFound ? 404 : 503 },
    );
  }

  return NextResponse.json({
    counted: true,
    learnerCount: typeof result.data === "number" ? result.data : null,
  });
}
