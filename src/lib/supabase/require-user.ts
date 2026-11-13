import "server-only";

import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ServerSupabase } from "@/lib/trails/server";

/**
 * The signed-in user's Supabase client, or a JSON error response (503 when
 * Supabase isn't configured, 401 when signed out).
 */
export async function requireUser(
  action: string,
): Promise<
  | { supabase: ServerSupabase; userId: string; error?: undefined }
  | { error: NextResponse }
> {
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

  return { supabase, userId: user.id };
}

/** Parse a positive integer route or body id (chunk ids are bigints). */
export function asChunkId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === "string" && /^\d{1,15}$/.test(value)) {
    const parsed = Number(value);
    return parsed >= 1 ? parsed : null;
  }

  return null;
}
