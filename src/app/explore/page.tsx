import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ProvenancePill } from "@/components/dashboard/provenance-pill";
import { ExploreNotice, ExploreShell } from "@/components/explore/explore-shell";
import { ChevronRightIcon } from "@/components/ui/dashboard-icons";
import { listPublishedTrails } from "@/lib/explore/server";
import {
  type ExploreSort,
  parseExploreSort,
  publishedTrailPath,
} from "@/lib/explore/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TrailError } from "@/lib/trails/server";

export const metadata: Metadata = {
  title: "Explore trails",
  description:
    "Popular reading paths other memex readers have shared. Follow one, then ask the same question of your own library.",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function learnerLabel(count: number): string {
  return `${count.toLocaleString("en-US")} learner${count === 1 ? "" : "s"}`;
}

function SortTabs({ sort }: { sort: ExploreSort }) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Sort trails">
      {(
        [
          ["popular", "Popular"],
          ["recent", "Newest"],
        ] as const
      ).map(([value, label]) => (
        <Link
          key={value}
          href={value === "popular" ? "/explore" : "/explore?sort=recent"}
          role="tab"
          aria-selected={sort === value}
          className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition ${
            sort === value
              ? "bg-white/[0.08] text-white"
              : "text-neutral-400 hover:bg-white/[0.035] hover:text-neutral-200"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="workspace-panel h-44 animate-pulse p-5">
          <div className="h-3 w-1/3 rounded-full bg-white/[0.06]" />
          <div className="mt-4 h-4 w-3/4 rounded-full bg-white/[0.08]" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

async function TrailList({ searchParams }: { searchParams: Promise<{ sort?: string | string[] }> }) {
  const sort = parseExploreSort((await searchParams).sort);
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <ExploreNotice
        title="Supabase is not configured"
        message="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local to load public trails."
      />
    );
  }

  let trails;

  try {
    trails = await listPublishedTrails(supabase, sort);
  } catch (error) {
    return (
      <ExploreNotice
        title="Public trails are unavailable"
        message={
          error instanceof TrailError
            ? error.message
            : "Something went wrong while loading public trails. Try again."
        }
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <SortTabs sort={sort} />
        <p className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-neutral-500">
          {trails.length} trail{trails.length === 1 ? "" : "s"}
        </p>
      </div>

      {trails.length === 0 ? (
        <ExploreNotice
          title="No public trails yet"
          message="Open one of your trails in the workspace and choose “Share on Explore” to be the first."
        />
      ) : (
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {trails.map((trail, index) => (
            <li key={trail.id}>
              <Link
                href={publishedTrailPath(trail.id)}
                className="workspace-panel group flex h-full flex-col p-5 transition hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-neutral-500">
                    {sort === "popular" ? `#${index + 1}` : dateFormatter.format(new Date(trail.publishedAt))}
                  </span>
                  <ProvenancePill provenance={trail.origin} />
                </div>
                <h2 className="mt-3 text-[1.08rem] font-semibold leading-snug tracking-[-0.02em] text-white">
                  {trail.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[14px] leading-6 text-neutral-400">
                  {trail.question}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4 font-mono text-[11.5px] uppercase tracking-[0.14em] text-neutral-500">
                  <span>
                    {trail.stepCount} steps · {learnerLabel(trail.learnerCount)}
                  </span>
                  <ChevronRightIcon className="size-4 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-neutral-300" />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <ExploreShell>
      <section className="mx-auto max-w-2xl pb-10 pt-14 text-center sm:pt-20">
        <p className="font-mono text-[11.5px] uppercase tracking-[0.28em] text-neutral-400">
          Explore
        </p>
        <h1 className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] text-white sm:text-[2.5rem]">
          Popular public trails
        </h1>
        <p className="mt-3 text-[15.5px] leading-7 text-mist">
          Reading paths other people shared. Follow how they worked through a
          question, then ask the same question of your own library.
        </p>
      </section>

      <Suspense fallback={<ListSkeleton />}>
        <TrailList searchParams={searchParams} />
      </Suspense>
    </ExploreShell>
  );
}
