import type { ReactNode } from "react";
import { AuthArtwork } from "@/components/art/auth-artwork";
import { BrandMark } from "./brand-mark";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <AuthArtwork />

      {/* Readability scrims: stronger over the brand column, softer over the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(78%_105%_at_0%_32%,rgba(10,10,10,0.97)_0%,rgba(10,10,10,0.84)_24%,rgba(10,10,10,0.36)_50%,rgba(10,10,10,0.07)_74%,rgba(10,10,10,0)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-gradient-to-t from-ink-950 via-ink-950/15 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-ink-950/45 lg:bg-transparent"
      />

      <div className="relative z-20 mx-auto flex min-h-dvh w-full max-w-7xl flex-col justify-center gap-8 px-6 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:px-10 lg:py-16">
        <section className="animate-rise max-w-xl lg:pr-8">
          <BrandMark />

          <div className="mt-8 lg:mt-24">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-mist-dim">
              Personal knowledge OS
            </p>
            <h1 className="mt-5 text-[2.15rem] font-semibold leading-[1.03] tracking-[-0.045em] text-white sm:text-5xl lg:text-[4.1rem]">
              Every thought,
              <br />
              <span className="text-neutral-500">within reach.</span>
            </h1>
            <p className="mt-4 hidden max-w-md text-[15px] leading-7 text-mist sm:block lg:mt-6">
              memex.ai turns scattered notes, documents and ideas into one
              searchable memory — private by default.
            </p>
          </div>

          <div className="mt-10 hidden items-center gap-3 lg:mt-24 lg:flex">
            <span className="h-px w-10 bg-line-strong" />
            <span className="text-[11px] tracking-wide text-mist-dim">
              Supabase Auth · PostgreSQL
            </span>
          </div>
        </section>

        <section className="animate-rise-delayed flex w-full justify-center lg:w-auto lg:shrink-0 lg:justify-end">
          {children}
        </section>
      </div>

      <div
        aria-hidden="true"
        className="grain pointer-events-none fixed inset-0 z-30"
      />
    </main>
  );
}
