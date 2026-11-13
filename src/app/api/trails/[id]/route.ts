import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadTrail, TrailError } from "@/lib/trails/server";

// Keep in sync with TRAIL_MAX_DURATION_SECONDS in lib/trails/timeouts.ts.
export const maxDuration = 60;

function errorResponse(error: unknown) {
  if (error instanceof TrailError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[trails/:id]", error);

  return NextResponse.json(
    { error: "Something went wrong while loading this trail. Try again." },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add the URL and anon key to .env.local.",
      },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in before loading a trail." },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  try {
    const trail = await loadTrail(supabase, user.id, id);

    if (!trail) {
      return NextResponse.json({ error: "Trail not found." }, { status: 404 });
    }

    return NextResponse.json({ trail });
  } catch (error) {
    return errorResponse(error);
  }
}
