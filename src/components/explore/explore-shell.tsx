import Link from "next/link";
import type { ReactNode } from "react";

import { AuthArtwork } from "@/components/art/auth-artwork";
import { BrandMark } from "@/components/auth/brand-mark";
import { ArrowRightIcon, TrailsIcon } from "@/components/ui/dashboard-icons";

/** Page frame for the public Explore pages. Works signed in or signed out. */
export function ExploreShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate min-h-dvh overflow-x-clip">
      <AuthArtwork />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(100%_82%_at_50%_38%,rgba(10,10,10,0.4)_0%,rgba(10,10,10,0.7)_48%,rgba(10,10,10,0.9)_100%)]"
      />

      <div className="relative z-20 flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-white/[0.055] bg-ink-950/30 backdrop-blur-xl">
          <div className="mx-auto flex h-[4.4rem] w-full max-w-[72rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href="/explore"
                aria-label="Explore public trails"
                className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <BrandMark />
              </Link>
              <span className="hidden h-5 w-px bg-white/[0.08] sm:block" />
              <span className="hidden font-mono text-[11.5px] uppercase tracking-[0.24em] text-neutral-500 sm:block">
                public trails
              </span>
            </div>

            <nav aria-label="Explore" className="flex items-center gap-1.5">
              <Link
                href="/explore"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-[13.5px] font-medium text-neutral-400 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <TrailsIcon className="size-4" />
                <span className="hidden sm:inline">Explore</span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.16] bg-white/[0.07] px-3 text-[13.5px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Your workspace
                <ArrowRightIcon className="size-3.5" />
              </Link>
            </nav>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[72rem] flex-1 px-4 pb-12 sm:px-6 lg:px-8">
          {children}
        </div>

        <footer className="mx-auto mt-10 w-full max-w-[72rem] border-t border-white/[0.055] px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-[13px] text-neutral-500">
            Trails here were shared by their authors. Private libraries stay private:
            only each step&apos;s note, summary, key quote, and source title are public.
          </p>
        </footer>
      </div>

      <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-30" />
    </main>
  );
}

export function ExploreNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="workspace-panel px-5 py-10 text-center">
      <p className="text-[15px] font-medium text-neutral-200">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-6 text-mist">{message}</p>
    </div>
  );
}
