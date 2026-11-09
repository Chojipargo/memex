import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/auth/brand-mark";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard",
};

async function AccountSummary() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <p className="text-[13.5px] leading-6 text-mist">
        Supabase is not configured yet. Add your credentials to{" "}
        <span className="font-mono text-[12px] text-neutral-200">.env.local</span>{" "}
        to enable authentication.
      </p>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <p className="text-[13.5px] leading-6 text-mist">
      Signed in as{" "}
      <span className="font-medium text-white">{user.email}</span>
    </p>
  );
}

function AccountSummarySkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="h-3.5 w-48 animate-pulse rounded-full bg-white/10" />
      <div className="h-3.5 w-32 animate-pulse rounded-full bg-white/[0.06]" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-950 px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_0%,rgba(255,255,255,0.06)_0%,rgba(10,10,10,0)_60%)]"
      />
      <div
        aria-hidden="true"
        className="grain pointer-events-none absolute inset-0"
      />

      <div className="auth-card relative p-8 sm:p-10">
        <BrandMark />

        <div className="mt-10">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-mist-dim">
            Workspace
          </p>
          <h1 className="mt-4 text-[30px] font-medium tracking-[-0.04em] text-white">
            You&apos;re in.
          </h1>
          <div className="mt-3">
            <Suspense fallback={<AccountSummarySkeleton />}>
              <AccountSummary />
            </Suspense>
          </div>
        </div>

        <div className="mt-9 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
          <p className="text-[12px] leading-5 text-mist-dim">
            This is a placeholder workspace. Your notes, documents and search
            will live here.
          </p>
        </div>

        <form action={signOut} className="mt-7">
          <button type="submit" className="btn-primary">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
