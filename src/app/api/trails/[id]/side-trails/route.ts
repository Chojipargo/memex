import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { trailErrorResponse } from "@/lib/trails/responses";
import {
  loadTrail,
  TRAIL_UUID_PATTERN,
  TrailError,
  trailSetupHint,
} from "@/lib/trails/server";

/** Start a side trail at one step. Body: { position } (1-based). Returns the new trail. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser("starting a side trail");

  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { position?: unknown } | null;
  const position = body?.position;

  if (!TRAIL_UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Trail not found." }, { status: 404 });
  }

  if (typeof position !== "number" || !Number.isInteger(position) || position < 1) {
    return NextResponse.json({ error: "Send the step `position` to branch from." }, { status: 400 });
  }

  try {
    const result = await auth.supabase.rpc("start_side_trail", {
      p_trail_id: id,
      p_position: position,
    });

    if (result.error) {
      if (/not found/i.test(result.error.message)) {
        throw new TrailError(result.error.message.replace(/\.?$/, "."), 404);
      }

      throw new TrailError(
        trailSetupHint(result.error.message, "starting side trails") ??
          "Could not start a side trail.",
        503,
      );
    }

    const trail =
      typeof result.data === "string"
        ? await loadTrail(auth.supabase, auth.userId, result.data)
        : null;

    if (!trail) {
      throw new TrailError("The trail service returned an unexpected response.", 502);
    }

    return NextResponse.json({ trail }, { status: 201 });
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while starting a side trail.");
  }
}
