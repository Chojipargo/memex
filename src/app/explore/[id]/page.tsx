import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  originProvenance,
  ProvenancePill,
} from "@/components/dashboard/provenance-pill";
import { ExploreNotice, ExploreShell } from "@/components/explore/explore-shell";
import { RecordLearner } from "@/components/explore/record-learner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
} from "@/components/ui/dashboard-icons";
import { loadPublishedTrail } from "@/lib/explore/server";
import { askInLibraryPath, type PublishedTrail } from "@/lib/explore/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TrailError } from "@/lib/trails/server";

export const metadata: Metadata = {
  title: "Public trail",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function TrailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-12">
      <div className="h-3 w-1/4 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="h-7 w-3/4 animate-pulse rounded-full bg-white/[0.08]" />
      {[0, 1, 2].map((item) => (
        <div key={item} className="workspace-panel h-36 animate-pulse" />
      ))}
    </div>
  );
}

function TrailView({ trail }: { trail: PublishedTrail }) {
  return (
    <article className="mx-auto max-w-3xl pt-10 sm:pt-14">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1.5 text-[13px] text-neutral-400 transition hover:text-white"
      >
        <ArrowLeftIcon className="size-3.5" />
        All public trails
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenancePill provenance={trail.origin} />
          <span className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-neutral-500">
            {trail.stepCount} steps · {trail.learnerCount.toLocaleString("en-US")} learner
            {trail.learnerCount === 1 ? "" : "s"} · shared{" "}
            {dateFormatter.format(new Date(trail.publishedAt))}
          </span>
        </div>
        <h1 className="mt-4 text-[1.9rem] font-semibold leading-tight tracking-[-0.035em] text-white sm:text-[2.3rem]">
          {trail.title}
        </h1>
        <p className="mt-3 text-[15.5px] leading-7 text-mist">
          <span className="text-neutral-500">Started from: </span>
          {trail.question}
        </p>
      </header>

      <ol className="mt-10 space-y-4">
        {trail.steps.map((step, index) => (
          <li key={step.position} className="workspace-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-neutral-500">
                Step {index + 1}
              </span>
              <ProvenancePill provenance={originProvenance(step.sourceOrigin)} />
            </div>

            <p className="mt-3 text-[15px] leading-7 text-neutral-200">{step.note}</p>

            {step.quote ? (
              <blockquote className="mt-4 border-l-2 border-white/25 pl-4 text-[15px] italic leading-7 text-neutral-100">
                “{step.quote}”
              </blockquote>
            ) : null}

            {step.gist ? (
              <p className="mt-4 text-[14px] leading-6 text-neutral-400">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  AI summary ·{" "}
                </span>
                {step.gist}
              </p>
            ) : null}

            <p className="mt-4 border-t border-white/[0.06] pt-3 text-[13px] text-neutral-500">
              {step.sourceUrl ? (
                <a
                  href={step.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-neutral-300 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                >
                  {step.sourceTitle}
                  <ArrowUpRightIcon className="size-3" />
                </a>
              ) : (
                <span className="text-neutral-300">{step.sourceTitle}</span>
              )}
              {step.sourceDomain ? ` · ${step.sourceDomain}` : ""}
              {step.sourceOrigin === "library" ? ` · p.${step.page} · from the author's library` : ""}
            </p>
          </li>
        ))}
      </ol>

      <section className="workspace-panel mt-8 flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
            Learn this your way
          </h2>
          <p className="mt-1 text-[14px] leading-6 text-mist">
            Ask the same question in your workspace. memex builds a new trail from
            your own sources, researching the web where your library is thin.
          </p>
        </div>
        <Link
          href={askInLibraryPath(trail.question, trail.id)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[14px] font-medium text-neutral-950 transition hover:bg-neutral-200"
        >
          Ask in my library
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </section>

      <RecordLearner publishedId={trail.id} />
    </article>
  );
}

async function TrailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <ExploreNotice
        title="Supabase is not configured"
        message="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local to load public trails."
      />
    );
  }

  let trail: PublishedTrail | null;

  try {
    trail = await loadPublishedTrail(supabase, id);
  } catch (error) {
    return (
      <div className="pt-12">
        <ExploreNotice
          title="This trail is unavailable"
          message={
            error instanceof TrailError
              ? error.message
              : "Something went wrong while loading this trail. Try again."
          }
        />
      </div>
    );
  }

  if (!trail) {
    notFound();
  }

  return <TrailView trail={trail} />;
}

export default function PublishedTrailPage({ params }: PageProps<"/explore/[id]">) {
  return (
    <ExploreShell>
      <Suspense fallback={<TrailSkeleton />}>
        <TrailContent params={params} />
      </Suspense>
    </ExploreShell>
  );
}
