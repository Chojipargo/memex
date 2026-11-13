import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { ANNOTATION_MAX_CHARS } from "@/lib/trails/edit-types";
import { TRAIL_UUID_PATTERN, trailSetupHint } from "@/lib/trails/server";

/** Set or clear your annotation on one step. Body: { annotation: string | null }. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; position: string }> },
) {
  const auth = await requireUser("annotating a trail");

  if (auth.error) {
    return auth.error;
  }

  const { id, position: rawPosition } = await context.params;
  const position = /^\d{1,3}$/.test(rawPosition) ? Number(rawPosition) : 0;

  if (!TRAIL_UUID_PATTERN.test(id) || position < 1) {
    return NextResponse.json({ error: "Step not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { annotation?: unknown } | null;

  if (!body || (body.annotation !== null && typeof body.annotation !== "string")) {
    return NextResponse.json(
      { error: "Send `annotation` as text, or null to clear it." },
      { status: 400 },
    );
  }

  const annotation = typeof body.annotation === "string" ? body.annotation.trim() : "";

  if (annotation.length > ANNOTATION_MAX_CHARS) {
    return NextResponse.json(
      { error: `Annotations are limited to ${ANNOTATION_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  const result = await auth.supabase
    .from("trail_steps")
    .update({ annotation: annotation || null })
    .eq("trail_id", id)
    .eq("position", position)
    .eq("user_id", auth.userId)
    .select("position, annotation")
    .maybeSingle();

  if (result.error) {
    return NextResponse.json(
      {
        error:
          trailSetupHint(result.error.message, "annotating trails") ??
          "Could not save this annotation.",
      },
      { status: 503 },
    );
  }

  if (!result.data) {
    return NextResponse.json({ error: "Step not found." }, { status: 404 });
  }

  return NextResponse.json({
    position,
    annotation: (result.data as { annotation: string | null }).annotation,
  });
}
