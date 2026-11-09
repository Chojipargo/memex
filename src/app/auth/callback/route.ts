import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();

    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  const url = new URL("/sign-in", origin);
  url.searchParams.set("error", "auth");
  return NextResponse.redirect(url);
}
