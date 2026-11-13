import { NextResponse } from "next/server";

import { parseTrailPublication } from "@/lib/explore/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trailErrorResponse } from "@/lib/trails/responses";
import { TRAIL_UUID_PATTERN, TrailError, trailSetupHint } from "@/lib/trails/server";

type Context = { params: Promise<{ id: string }> };

/** Signed-in Supabase client and a validated trail id, or an error response. */
async function authorize(context: Context, action: string) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured. Add the URL and anon key to .env.local." },
        { status: 503 },
      ),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: `You need to sign in before ${action}.` },
        { status: 401 },
      ),
    };
  }

  const { id } = await context.params;

  if (!TRAIL_UUID_PATTERN.test(id)) {
    return {
      error: NextResponse.json({ error: "Trail not found." }, { status: 404 }),
    };
  }

  return { supabase, trailId: id };
}

function rpcError(message: string, action: string, fallback: string): TrailError {
  if (/trail not found/i.test(message)) {
    return new TrailError("Trail not found.", 404);
  }

  if (/no steps|more than 40 steps/i.test(message)) {
    return new TrailError(message, 400);
  }

  return new TrailError(trailSetupHint(message, action) ?? fallback, 503);
}

async function readPublication(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  trailId: string,
) {
  const result = await supabase.rpc("get_trail_publication", { p_trail_id: trailId });

  if (result.error) {
    throw rpcError(
      result.error.message,
      "sharing trails",
      "Could not check whether this trail is public.",
    );
  }

  return parseTrailPublication(result.data);
}

/** Whether the caller's trail is published, and how many people learned from it. */
export async function GET(_request: Request, context: Context) {
  const auth = await authorize(context, "sharing a trail");

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const publication = await readPublication(auth.supabase, auth.trailId);
    return NextResponse.json({ publication });
  } catch (error) {
    return trailErrorResponse(error, "Could not check whether this trail is public.");
  }
}

/** Publish the trail, or refresh its public copy with the latest steps. */
export async function POST(_request: Request, context: Context) {
  const auth = await authorize(context, "sharing a trail");

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const result = await auth.supabase.rpc("publish_trail", {
      p_trail_id: auth.trailId,
    });

    if (result.error) {
      throw rpcError(result.error.message, "sharing trails", "Could not publish this trail.");
    }

    const publication = await readPublication(auth.supabase, auth.trailId);

    if (!publication) {
      throw new TrailError("The trail service returned an unexpected response.", 502);
    }

    return NextResponse.json({ publication });
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while publishing this trail.");
  }
}

/** Remove the trail from Explore. The private trail is untouched. */
export async function DELETE(_request: Request, context: Context) {
  const auth = await authorize(context, "sharing a trail");

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const result = await auth.supabase.rpc("unpublish_trail", {
      p_trail_id: auth.trailId,
    });

    if (result.error) {
      throw rpcError(result.error.message, "sharing trails", "Could not unpublish this trail.");
    }

    return NextResponse.json({ publication: null });
  } catch (error) {
    return trailErrorResponse(error, "Something went wrong while unpublishing this trail.");
  }
}
