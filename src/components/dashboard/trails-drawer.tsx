"use client";

import { useState } from "react";

import {
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";
import { DrawerFrame } from "@/components/dashboard/overlay";
import { TrailMiniGraph } from "@/components/dashboard/trail-graph";
import type { Trail } from "@/lib/dashboard/data";

type TrailFilter = "all" | "saved" | "active";

export function TrailsDrawer({
  open,
  onClose,
  trails,
  activeTrailId,
  onOpenTrail,
  onNewNote,
}: {
  open: boolean;
  onClose: () => void;
  trails: Trail[];
  activeTrailId: string | null;
  onOpenTrail: (trail: Trail) => void;
  onNewNote: () => void;
}) {
  const [filter, setFilter] = useState<TrailFilter>("all");

  const visible = trails.filter((trail) => {
    if (filter === "saved") {
      return trail.saved;
    }

    if (filter === "active") {
      return trail.id === activeTrailId;
    }

    return true;
  });

  return (
    <DrawerFrame open={open} onClose={onClose} labelledBy="trails-title">
      <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.28em] text-neutral-400">
            Trail archive
          </p>
          <h2
            id="trails-title"
            className="mt-2 text-[1.4rem] font-semibold tracking-[-0.035em] text-white"
          >
            Previous trails
          </h2>
          <p className="mt-1.5 max-w-sm text-[14.5px] leading-5 text-mist">
            Every path you followed, with the branches you left open.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close previous trails"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-3 sm:px-6">
        {(
          [
            ["all", "All", trails.length],
            ["saved", "Saved", trails.filter((trail) => trail.saved).length],
            [
              "active",
              "Active",
              activeTrailId
                ? trails.filter((trail) => trail.id === activeTrailId).length
                : 0,
            ],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition ${
              filter === value
                ? "bg-white/[0.08] text-white"
                : "text-neutral-400 hover:bg-white/[0.035] hover:text-neutral-200"
            }`}
          >
            {label}
            <span className="ml-1.5 font-mono text-[11.5px] text-neutral-500">
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-6">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.09] px-5 py-12 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-neutral-400">
              <TrailsIcon className="size-5" />
            </span>
            <p className="mt-4 text-[15px] font-medium text-neutral-200">
              No trails here yet.
            </p>
            <p className="mt-1.5 text-[14px] text-mist-dim">
              Start with a note and memex will begin the path.
            </p>
          </div>
        ) : (
          visible.map((trail) => (
            <button
              key={trail.id}
              type="button"
              onClick={() => {
                onClose();
                onOpenTrail(trail);
              }}
              className="group block w-full rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition duration-200 hover:border-white/[0.15] hover:bg-white/[0.045]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-medium text-neutral-100">
                      {trail.title}
                    </p>
                    {trail.id === activeTrailId ? (
                      <span className="rounded-full border border-white/15 bg-white/[0.07] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-neutral-300">
                        active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-5 text-neutral-400">
                    {trail.description}
                  </p>
                </div>
                <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-neutral-300" />
              </div>

              <div className="mt-3 border-t border-white/[0.055] pt-1">
                <TrailMiniGraph
                  nodes={trail.nodes}
                  active={trail.id === activeTrailId}
                />
              </div>

              <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[11.5px] uppercase tracking-[0.14em] text-neutral-500">
                <span>{trail.nodes.length} notes</span>
                <span>{trail.updatedAt}</span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="border-t border-white/[0.07] p-4 sm:p-6">
        <button
          type="button"
          onClick={() => {
            onClose();
            onNewNote();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.045] px-4 py-2.5 text-[14.5px] font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
        >
          <PlusIcon className="size-4" />
          Begin a new trail
        </button>
      </div>
    </DrawerFrame>
  );
}
