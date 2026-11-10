"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ContinueTrail } from "@/components/dashboard/continue-trail";
import { CenteredStage, DrawerFrame } from "@/components/dashboard/overlay";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BranchIcon,
  CloseIcon,
  LinkIcon,
  PinIcon,
  SparkIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";
import type { Association, Note, Trail, TrailNode } from "@/lib/dashboard/data";
import type { TrailApi } from "@/lib/trails/api";
import { apiTrailIdOf } from "@/lib/trails/to-workspace";

function kindLabel(kind: Note["kind"]) {
  if (kind === "quote") return "Quotation";
  if (kind === "question") return "Open question";
  if (kind === "source") return "Source";
  return "Thought";
}

export function TrailDetailDialog({
  trail,
  notes,
  activeTrailId,
  focusedNodeIndex,
  trailPosition,
  onPreviousTrail,
  onNextTrail,
  onClose,
  onResume,
  onToggleSave,
  onOpenNote,
  onBranch,
  onTrailContinued,
  onUploadSource,
}: {
  trail: Trail | null;
  notes: Note[];
  activeTrailId: string | null;
  focusedNodeIndex: number;
  trailPosition: { current: number; total: number };
  onPreviousTrail: () => void;
  onNextTrail: () => void;
  onClose: () => void;
  onResume: (trail: Trail) => void;
  onToggleSave: (trail: Trail) => void;
  onOpenNote: (note: Note, trailId?: string) => void;
  onBranch: (node: TrailNode) => void;
  onTrailContinued: (trail: TrailApi) => void;
  onUploadSource: () => void;
}) {
  const isActive = trail?.id === activeTrailId;
  const apiTrailId = trail ? apiTrailIdOf(trail) : null;
  // Index of the first step added by the latest continuation, so only the
  // new nodes animate in.
  const [appended, setAppended] = useState<{ trailId: string; from: number } | null>(
    null,
  );
  const appendedFrom =
    trail && appended?.trailId === trail.id ? appended.from : Number.POSITIVE_INFINITY;
  const noteMap = new Map(notes.map((note) => [note.id, note]));
  const reduceMotion = useReducedMotion();
  const nodeRefs = useRef<(HTMLLIElement | null)[]>([]);
  const noteButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const previousTrailId = useRef<string | null>(null);
  const trailId = trail?.id ?? null;

  useEffect(() => {
    if (!trailId) {
      previousTrailId.current = null;
      return;
    }

    const changedTrail = previousTrailId.current !== trailId;
    previousTrailId.current = trailId;

    // Move DOM focus onto the active note as the trail opens or moves. This
    // removes focus from the background trail card and makes Enter work via
    // the button's native activation instead of the global fallback handler.
    noteButtonRefs.current[focusedNodeIndex]?.focus({ preventScroll: true });

    if (!changedTrail) {
      nodeRefs.current[focusedNodeIndex]?.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  }, [focusedNodeIndex, reduceMotion, trailId]);

  const trailNavigation = trail ? (
    <div
      role="group"
      aria-label="Trail navigation"
      className="flex items-center gap-0.5 rounded-full border border-white/[0.12] bg-ink-900/90 p-1 shadow-[0_18px_60px_-24px_rgba(0,0,0,1)] backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={onPreviousTrail}
        disabled={trailPosition.total <= 1}
        aria-label="Previous trail"
        title="Previous trail"
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] text-neutral-400 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <ArrowLeftIcon className="size-3.5" />
        <span className="hidden sm:inline">Previous trail</span>
      </button>

      <span
        role="status"
        aria-live="polite"
        className="min-w-[5.5rem] px-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-500"
      >
        Trail {trailPosition.current} of {trailPosition.total}
      </span>

      <button
        type="button"
        onClick={onNextTrail}
        disabled={trailPosition.total <= 1}
        aria-label="Next trail"
        title="Next trail"
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] text-neutral-400 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span className="hidden sm:inline">Next trail</span>
        <ArrowRightIcon className="size-3.5" />
      </button>
    </div>
  ) : null;

  return (
    <CenteredStage
      open={trail !== null}
      onClose={onClose}
      labelledBy="trail-detail-title"
      topBar={trailNavigation}
      className="max-w-[44rem]"
    >
      {trail ? (
        <motion.div
          key={trail.id}
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-400">
                  <TrailsIcon className="size-3" />
                  Trail
                </span>
                {isActive ? (
                  <span className="rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-white">
                    active
                  </span>
                ) : null}
                {trail.saved ? (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-500">
                    saved
                  </span>
                ) : null}
              </div>

              <h2
                id="trail-detail-title"
                className="mt-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.04em] text-white sm:text-[1.75rem]"
              >
                {trail.title}
              </h2>
              <p className="mt-2 max-w-xl text-[12.5px] leading-6 text-mist">
                {trail.description}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close trail"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-neutral-500">
                  The path
                </p>
                <span
                  aria-live="polite"
                  className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-neutral-500"
                >
                  Note{" "}
                  {trail.nodes.length === 0 ? 0 : focusedNodeIndex + 1} of{" "}
                  {trail.nodes.length}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600">
                {trail.nodes.length} notes · {trail.updatedAt}
              </p>
            </div>

            {trail.nodes.length > 1 ? (
              <p className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-600">
                <kbd className="rounded border border-white/[0.09] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-neutral-400">
                  ←
                </kbd>
                <kbd className="rounded border border-white/[0.09] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-neutral-400">
                  →
                </kbd>
                to move through notes · Enter to open
              </p>
            ) : null}

            <ol className="relative space-y-2.5">
              {trail.nodes.map((node, index) => {
                const note = noteMap.get(node.noteId);
                const isFocused = index === focusedNodeIndex;
                const isNew = index >= appendedFrom;

                return (
                  <motion.li
                    key={node.id}
                    ref={(element) => {
                      nodeRefs.current[index] = element;
                    }}
                    initial={
                      isNew
                        ? reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 14 }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: isNew ? 0.08 * (index - appendedFrom) : 0,
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="relative flex gap-3.5"
                  >
                    {index < trail.nodes.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[0.9rem] top-9 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-white/15 to-white/[0.03]"
                      />
                    ) : null}

                    <span
                      className={`relative z-10 mt-1 grid size-[1.8rem] shrink-0 place-items-center rounded-full border font-mono text-[9.5px] transition ${
                        isFocused
                          ? "border-white/40 bg-white/[0.12] text-white"
                          : "border-white/[0.12] bg-ink-900 text-neutral-400"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div
                      aria-current={isFocused ? "step" : undefined}
                      className={`min-w-0 flex-1 rounded-xl border p-3.5 transition ${
                        isFocused
                          ? "border-white/25 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-36px_rgba(255,255,255,0.28)]"
                          : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.13] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          ref={(element) => {
                            noteButtonRefs.current[index] = element;
                          }}
                          onClick={() => note && onOpenNote(note, trail.id)}
                          disabled={!note}
                          className="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                        >
                          <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-600">
                            {node.relation}
                          </p>
                          <p className="mt-1 truncate text-[12.5px] font-medium text-neutral-100 transition hover:text-white">
                            {node.label}
                          </p>
                          {note ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-neutral-500">
                              {note.excerpt}
                            </p>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => onBranch(node)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10.5px] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
                          aria-label={`Branch from ${node.label}`}
                        >
                          <BranchIcon className="size-3.5" />
                          Branch
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ol>

            {apiTrailId ? (
              <ContinueTrail
                key={trail.id}
                apiTrailId={apiTrailId}
                onUploadSource={onUploadSource}
                onContinued={(updated) => {
                  setAppended({ trailId: trail.id, from: trail.nodes.length });
                  onTrailContinued(updated);
                }}
              />
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-4 sm:px-7">
            <button
              type="button"
              onClick={() => onToggleSave(trail)}
              className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-[11.5px] font-medium text-neutral-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
            >
              {trail.saved ? "Saved to archive" : "Save this trail"}
            </button>
            <button
              type="button"
              onClick={() => onResume(trail)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[11.5px] font-medium text-neutral-950 transition hover:bg-neutral-200"
            >
              {isActive ? "Trail is active" : "Resume trail"}
              <ArrowRightIcon className="size-3.5" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </CenteredStage>
  );
}

export function NoteDetailDrawer({
  note,
  notes,
  associations,
  trail,
  position,
  direction,
  onClose,
  onOpenNote,
  onPreviousNote,
  onNextNote,
  onTogglePin,
  onBranch,
}: {
  note: Note | null;
  notes: Note[];
  associations: Association[];
  trail: Trail | null;
  position: { current: number; total: number } | null;
  direction: 1 | -1;
  onClose: () => void;
  onOpenNote: (note: Note) => void;
  onPreviousNote: () => void;
  onNextNote: () => void;
  onTogglePin: (note: Note) => void;
  onBranch: (note: Note) => void;
}) {
  const noteMap = new Map(notes.map((item) => [item.id, item]));
  const reduceMotion = useReducedMotion();
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (note?.id) {
      noteRef.current?.focus({ preventScroll: true });
    }
  }, [note?.id]);
  const connected = note
    ? associations
        .filter(
          (association) =>
            association.fromId === note.id || association.toId === note.id,
        )
        .map((association) => ({
          association,
          other: noteMap.get(
            association.fromId === note.id
              ? association.toId
              : association.fromId,
          ),
        }))
        .filter((entry): entry is { association: Association; other: Note } =>
          Boolean(entry.other),
        )
    : [];

  return (
    <DrawerFrame open={note !== null} onClose={onClose} labelledBy="note-title">
      {note ? (
        <motion.div
          key={note.id}
          ref={noteRef}
          tabIndex={-1}
          initial={
            reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: direction * 24 }
          }
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-h-0 flex-1 flex-col outline-none"
        >
          <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-400">
                  {kindLabel(note.kind)}
                </span>
                <span className="text-[10.5px] text-neutral-600">{note.tag}</span>
              </div>
              <h2
                id="note-title"
                className="mt-3 text-[1.35rem] font-semibold leading-[1.15] tracking-[-0.035em] text-white sm:text-[1.55rem]"
              >
                {note.title}
              </h2>
              {note.source ? (
                <p className="mt-2 text-[11px] text-neutral-500">{note.source}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close note"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {trail && position && position.total > 1 ? (
              <div
                role="group"
                aria-label="Note navigation"
                className="mb-5 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-2 p-1.5">
                  <button
                    type="button"
                    onClick={onPreviousNote}
                    aria-label="Previous note in trail"
                    title="Previous note (← or ↑)"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[10.5px] text-neutral-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  <div className="min-w-0 text-center">
                    <p
                      aria-live="polite"
                      className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-500"
                    >
                      Note {position.current} of {position.total}
                    </p>
                    <p className="mt-0.5 max-w-[13rem] truncate text-[10.5px] text-neutral-600">
                      {trail.title}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onNextNote}
                    aria-label="Next note in trail"
                    title="Next note (→ or ↓)"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[10.5px] text-neutral-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ArrowRightIcon className="size-3.5" />
                  </button>
                </div>
                <p className="border-t border-white/[0.055] px-3 py-1.5 text-center text-[10px] text-neutral-600">
                  Use{" "}
                  <kbd className="rounded border border-white/[0.09] bg-white/[0.03] px-1 font-mono text-[9px] text-neutral-400">
                    ←
                  </kbd>{" "}
                  <kbd className="rounded border border-white/[0.09] bg-white/[0.03] px-1 font-mono text-[9px] text-neutral-400">
                    →
                  </kbd>{" "}
                  or{" "}
                  <kbd className="rounded border border-white/[0.09] bg-white/[0.03] px-1 font-mono text-[9px] text-neutral-400">
                    ↑
                  </kbd>{" "}
                  <kbd className="rounded border border-white/[0.09] bg-white/[0.03] px-1 font-mono text-[9px] text-neutral-400">
                    ↓
                  </kbd>{" "}
                  to move through this trail
                </p>
              </div>
            ) : null}

            <p className="text-[13.5px] leading-7 text-neutral-300">{note.body}</p>

            <div className="mt-8 border-t border-white/[0.07] pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-neutral-500">
                  Associations
                </p>
                <span className="text-[10px] text-neutral-600">
                  {connected.length} connection{connected.length === 1 ? "" : "s"}
                </span>
              </div>

              {connected.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {connected.map(({ association, other }) => (
                    <button
                      key={association.id}
                      type="button"
                      onClick={() => onOpenNote(other)}
                      className="group flex w-full items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-left transition hover:border-white/[0.13] hover:bg-white/[0.04]"
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-neutral-500 transition group-hover:text-white">
                        <LinkIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-neutral-200">
                          {other.title}
                        </span>
                        <span className="mt-1 block text-[10.5px] leading-4 text-neutral-500">
                          {association.hint}
                        </span>
                        <span className="mt-2 flex items-center gap-2">
                          <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <span
                              className="block h-full rounded-full bg-white/35"
                              style={{ width: `${association.strength}%` }}
                            />
                          </span>
                          <span className="font-mono text-[9px] text-neutral-600">
                            {association.strength}%
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center">
                  <SparkIcon className="mx-auto size-4 text-neutral-600" />
                  <p className="mt-2 text-[11.5px] text-neutral-500">
                    No associations yet. A new connection may appear as your
                    library grows.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-4 sm:px-7">
            <button
              type="button"
              onClick={() => onTogglePin(note)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11.5px] font-medium transition ${
                note.pinned
                  ? "border-white/20 bg-white/[0.08] text-white"
                  : "border-white/[0.09] bg-white/[0.03] text-neutral-300 hover:border-white/15 hover:bg-white/[0.06]"
              }`}
            >
              <PinIcon className="size-3.5" />
              {note.pinned ? "Pinned" : "Pin note"}
            </button>
            <button
              type="button"
              onClick={() => onBranch(note)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[11.5px] font-medium text-neutral-950 transition hover:bg-neutral-200"
            >
              <BranchIcon className="size-3.5" />
              Branch from here
            </button>
          </div>
        </motion.div>
      ) : null}
    </DrawerFrame>
  );
}
