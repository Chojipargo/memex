"use client";

import { useEffect, useId } from "react";

import { DrawerFrame } from "@/components/dashboard/overlay";
import {
  originProvenance,
  ProvenancePill,
} from "@/components/dashboard/provenance-pill";
import { BacklinksPanel } from "@/components/dashboard/backlinks-panel";
import { HighlightedPassage } from "@/components/dashboard/trail-step-card";
import { ArrowUpRightIcon, CloseIcon } from "@/components/ui/dashboard-icons";
import type { Note } from "@/lib/dashboard/data";
import type { LinkedPassage } from "@/lib/links/types";
import { chunkIdOf } from "@/lib/trails/to-workspace";

function retrieveLabel(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

/** Glassmorphism side panel showing the exact cited text and its URL. */
export function CitationDrawer({
  note,
  onClose,
  onOpenPassage,
  onOpenTrailAt,
}: {
  note: Note | null;
  onClose: () => void;
  /** Follow a link to another passage. */
  onOpenPassage?: (passage: LinkedPassage) => void;
  /** Jump into a trail at the given 1-based position. */
  onOpenTrailAt?: (trailId: string, position: number) => void;
}) {
  const titleId = useId();
  const open = note !== null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const provenance = originProvenance(note?.sourceOrigin);
  const chunkId = note ? chunkIdOf(note) : null;
  const retrievedAt = retrieveLabel(note?.retrievedAt);

  return (
    <DrawerFrame open={open} onClose={onClose} labelledBy={titleId}>
      {note ? (
        <>
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <p className="font-mono text-[11.5px] uppercase tracking-[0.26em] text-neutral-400">
                Source
              </p>
              <h2
                id={titleId}
                className="mt-2 truncate text-[1.05rem] font-semibold tracking-[-0.025em] text-white"
              >
                {note.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ProvenancePill provenance={provenance} />
                {note.sourceDomain ? (
                  <span className="font-mono text-[12px] text-neutral-400">
                    {note.sourceDomain}
                  </span>
                ) : null}
                <span className="font-mono text-[12px] text-neutral-500">
                  {note.tag}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close source panel"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {note.quote ? (
              <figure className="rounded-2xl border border-white/[0.1] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                  Cited passage
                </p>
                <blockquote className="mt-2 text-[15px] leading-6 text-neutral-200 italic">
                  “{note.quote}”
                </blockquote>
              </figure>
            ) : null}

            <section className="mt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                Retrieved text
              </p>
              <div className="mt-2 whitespace-pre-line text-[14.5px] leading-6 text-neutral-300">
                <HighlightedPassage text={note.body} quote={note.quote} />
              </div>
            </section>

            <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 border-t border-white/[0.07] pt-4 text-[13px]">
              <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                Origin
              </dt>
              <dd className="text-neutral-300">
                {note.sourceOrigin === "web"
                  ? note.sourceProvider
                    ? `Web research via ${note.sourceProvider}`
                    : "Web research"
                  : "Your uploaded library"}
              </dd>
              {retrievedAt ? (
                <>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                    Retrieved
                  </dt>
                  <dd className="text-neutral-300">{retrievedAt}</dd>
                </>
              ) : null}
            </dl>

            {chunkId !== null && onOpenPassage && onOpenTrailAt ? (
              <BacklinksPanel
                key={chunkId}
                chunkId={chunkId}
                onOpenPassage={onOpenPassage}
                onOpenTrailAt={onOpenTrailAt}
              />
            ) : null}
          </div>

          {note.sourceUrl ? (
            <div className="border-t border-white/[0.08] px-5 py-4 sm:px-6">
              <a
                href={note.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2.5 text-[13.5px] font-medium text-white transition hover:border-white/30 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Open source
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            </div>
          ) : null}
        </>
      ) : null}
    </DrawerFrame>
  );
}
