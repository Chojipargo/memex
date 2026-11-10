"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowUpRightIcon,
  BookIcon,
  HelpIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";
import { DialogFrame } from "@/components/dashboard/overlay";
import type { Note, Trail } from "@/lib/dashboard/data";

type CommandItem = {
  id: string;
  kind: "trail" | "note" | "action";
  title: string;
  subtitle: string;
  icon: ReactNode;
  keywords: string;
  perform: () => void;
};

export function CommandPalette({
  open,
  onClose,
  notes,
  trails,
  onOpenNote,
  onOpenTrail,
  onUpload,
  onNewNote,
  onOpenTrails,
  onSupport,
}: {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  trails: Trail[];
  onOpenNote: (note: Note) => void;
  onOpenTrail: (trail: Trail) => void;
  onUpload: () => void;
  onNewNote: () => void;
  onOpenTrails: () => void;
  onSupport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const trailItems = trails.map((trail) => ({
      id: `trail-${trail.id}`,
      kind: "trail" as const,
      title: trail.title,
      subtitle: `${trail.nodes.length} notes · ${trail.updatedAt}`,
      icon: <TrailsIcon className="size-4" />,
      keywords: `${trail.title} ${trail.description} trail`,
      perform: () => onOpenTrail(trail),
    }));

    const noteItems = notes.map((note) => ({
      id: `note-${note.id}`,
      kind: "note" as const,
      title: note.title,
      subtitle: note.excerpt,
      icon: <BookIcon className="size-4" />,
      keywords: `${note.title} ${note.excerpt} ${note.tag} ${note.body}`,
      perform: () => onOpenNote(note),
    }));

    const actionItems: CommandItem[] = [
      {
        id: "action-new-note",
        kind: "action",
        title: "Start a new note",
        subtitle: "Capture a thought and embed it in your graph",
        icon: <PlusIcon className="size-4" />,
        keywords: "new note write create capture",
        perform: onNewNote,
      },
      {
        id: "action-upload",
        kind: "action",
        title: "Upload a document",
        subtitle: "Add a PDF, text file, or pasted note",
        icon: <ArrowUpRightIcon className="size-4" />,
        keywords: "upload document pdf text file ingest import",
        perform: onUpload,
      },
      {
        id: "action-trails",
        kind: "action",
        title: "Browse previous trails",
        subtitle: "Resume a path you explored before",
        icon: <TrailsIcon className="size-4" />,
        keywords: "previous trails history resume saved",
        perform: onOpenTrails,
      },
      {
        id: "action-help",
        kind: "action",
        title: "Ask the archivist",
        subtitle: "Open the help center and assistant",
        icon: <HelpIcon className="size-4" />,
        keywords: "help support assistant guide",
        perform: onSupport,
      },
    ];

    return [...trailItems, ...noteItems, ...actionItems];
  }, [
    notes,
    onNewNote,
    onOpenNote,
    onOpenTrail,
    onOpenTrails,
    onSupport,
    onUpload,
    trails,
  ]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return items;
    }

    return items.filter((item) =>
      item.keywords.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  const sections = useMemo(
    () =>
      (
        [
          ["Trails", filtered.filter((item) => item.kind === "trail")],
          ["Notes", filtered.filter((item) => item.kind === "note")],
          ["Actions", filtered.filter((item) => item.kind === "action")],
        ] as const
      ).filter(([, sectionItems]) => sectionItems.length > 0),
    [filtered],
  );

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const select = (item: CommandItem | undefined) => {
    if (!item) {
      return;
    }

    onClose();
    item.perform();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length === 0 ? 0 : (current + 1) % filtered.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length === 0
          ? 0
          : (current - 1 + filtered.length) % filtered.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      select(filtered[activeIndex]);
    }
  };

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      labelledBy="command-title"
      className="max-w-[42rem]"
    >
      <h2 id="command-title" className="sr-only">
        Search memex
      </h2>

      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
        <SearchIcon className="size-[18px] shrink-0 text-neutral-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search notes, trails, or commands..."
          aria-label="Search memex"
          autoComplete="off"
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-neutral-500"
        />
        <kbd className="hidden rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-neutral-500 sm:block">
          esc
        </kbd>
      </div>

      <div className="max-h-[min(58dvh,31rem)] overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-neutral-400">
              <SparkIcon className="size-5" />
            </span>
            <p className="mt-4 text-[13px] font-medium text-neutral-200">
              No note or trail matches “{query.trim()}”
            </p>
            <p className="mt-1.5 text-[12px] text-mist-dim">
              Start a new note and memex will begin a trail for it.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNewNote();
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-white/[0.09]"
            >
              <PlusIcon className="size-4" />
              New note
            </button>
          </div>
        ) : (
          sections.map(([label, sectionItems]) => (
            <div key={label} className="mb-1.5 last:mb-0">
              <p className="px-3 pb-1 pt-2 font-mono text-[8.5px] uppercase tracking-[0.26em] text-neutral-600">
                {label}
              </p>
              <div className="space-y-0.5">
                {sectionItems.map((item) => {
                  const flatIndex = filtered.indexOf(item);
                  const active = flatIndex === activeIndex;

                  return (
                    <button
                      key={item.id}
                      ref={(node) => {
                        itemRefs.current[flatIndex] = node;
                      }}
                      type="button"
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onClick={() => select(item)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-white/[0.075] text-white"
                          : "text-neutral-300 hover:bg-white/[0.035]"
                      }`}
                    >
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-lg border ${
                          active
                            ? "border-white/15 bg-white/[0.07] text-white"
                            : "border-white/[0.07] bg-white/[0.025] text-neutral-500"
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                          {item.subtitle}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-neutral-600">
                        {item.kind === "action" ? "run" : "open"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-neutral-600 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-white/10 bg-white/[0.03] px-1 py-0.5 font-mono text-[8.5px]">
              ↑
            </kbd>
            <kbd className="rounded border border-white/10 bg-white/[0.03] px-1 py-0.5 font-mono text-[8.5px]">
              ↓
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-white/10 bg-white/[0.03] px-1 py-0.5 font-mono text-[8.5px]">
              ↵
            </kbd>
            open
          </span>
        </div>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.18em]">
          associative search
        </span>
      </div>
    </DialogFrame>
  );
}
