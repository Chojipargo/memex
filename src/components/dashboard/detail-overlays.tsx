"use client";

import {
  ArrowRightIcon,
  BranchIcon,
  CloseIcon,
  LinkIcon,
  PinIcon,
  SparkIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";
import { DialogFrame, DrawerFrame } from "@/components/dashboard/overlay";
import type { Association, Note, Trail, TrailNode } from "@/lib/dashboard/data";

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
  onClose,
  onResume,
  onToggleSave,
  onOpenNote,
  onBranch,
}: {
  trail: Trail | null;
  notes: Note[];
  activeTrailId: string | null;
  onClose: () => void;
  onResume: (trail: Trail) => void;
  onToggleSave: (trail: Trail) => void;
  onOpenNote: (note: Note) => void;
  onBranch: (node: TrailNode) => void;
}) {
  const isActive = trail?.id === activeTrailId;
  const noteMap = new Map(notes.map((note) => [note.id, note]));

  return (
    <DialogFrame
      open={trail !== null}
      onClose={onClose}
      labelledBy="trail-detail-title"
      className="max-w-[44rem]"
    >
      {trail ? (
        <>
          <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
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

          <div className="px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-neutral-500">
                The path
              </p>
              <p className="text-[11px] text-neutral-600">
                {trail.nodes.length} notes · {trail.updatedAt}
              </p>
            </div>

            <ol className="relative space-y-2.5">
              {trail.nodes.map((node, index) => {
                const note = noteMap.get(node.noteId);

                return (
                  <li key={node.id} className="relative flex gap-3.5">
                    {index < trail.nodes.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[0.9rem] top-9 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-white/15 to-white/[0.03]"
                      />
                    ) : null}

                    <span className="relative z-10 mt-1 grid size-[1.8rem] shrink-0 place-items-center rounded-full border border-white/[0.12] bg-ink-900 font-mono text-[9.5px] text-neutral-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 transition hover:border-white/[0.13] hover:bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => note && onOpenNote(note)}
                          disabled={!note}
                          className="min-w-0 text-left"
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
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-4 sm:px-7">
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
        </>
      ) : null}
    </DialogFrame>
  );
}

export function NoteDetailDrawer({
  note,
  notes,
  associations,
  onClose,
  onOpenNote,
  onTogglePin,
  onBranch,
}: {
  note: Note | null;
  notes: Note[];
  associations: Association[];
  onClose: () => void;
  onOpenNote: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onBranch: (note: Note) => void;
}) {
  const noteMap = new Map(notes.map((item) => [item.id, item]));
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
        <>
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
        </>
      ) : null}
    </DrawerFrame>
  );
}
