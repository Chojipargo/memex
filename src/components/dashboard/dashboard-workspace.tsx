"use client";

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { signOut } from "@/app/dashboard/actions";
import { BrandMark } from "@/components/auth/brand-mark";
import { CommandPalette } from "@/components/dashboard/command-palette";
import {
  NoteDetailDrawer,
  TrailDetailDialog,
} from "@/components/dashboard/detail-overlays";
import { DashboardHero } from "@/components/dashboard/hero";
import { SupportDialog } from "@/components/dashboard/support-dialog";
import { TrailsDrawer } from "@/components/dashboard/trails-drawer";
import {
  AssociativeMap,
  TrailMiniGraph,
} from "@/components/dashboard/trail-graph";
import {
  UploadDialog,
  type NoteCreated,
} from "@/components/dashboard/upload-dialog";
import {
  ChevronRightIcon,
  HelpIcon,
  LinkIcon,
  LogOutIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";
import { UploadIcon } from "@/components/ui/icons";
import {
  mapEdges,
  mapNodes,
  seedAssociations,
  seedNotes,
  seedTrails,
  type Note,
  type Trail,
  type TrailNode,
} from "@/lib/dashboard/data";

type Overlay = "search" | "trails" | "upload" | "support" | null;
type UploadTab = "pdf" | "note";

const STORAGE_KEY = "memex.workspace.v1";

type StoredWorkspace = {
  notes?: Note[];
  trails?: Trail[];
  activeTrailId?: string | null;
};

function TrailCard({
  trail,
  active,
  index,
  onOpen,
}: {
  trail: Trail;
  active: boolean;
  index: number;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            delay: 0.06 * index,
            duration: 0.55,
            ease: [0.16, 1, 0.3, 1] as const,
          },
        },
        hover: { y: -3, transition: { duration: 0.2, ease: "easeOut" } },
      }}
      className="group relative flex min-h-[15.5rem] w-full flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-gradient-to-b from-white/[0.055] to-white/[0.018] p-5 text-left backdrop-blur-xl transition-colors duration-200 hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-44 rounded-full bg-white/[0.035] blur-3xl transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-neutral-500">
          <TrailsIcon className="size-3" />
          trail
        </span>
        {active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-white">
            <span className="size-1 rounded-full bg-white" />
            active
          </span>
        ) : null}
        <ChevronRightIcon className="ml-auto size-4 text-neutral-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-300" />
      </div>

      <h3 className="mt-4 text-[15px] font-medium leading-5 tracking-[-0.02em] text-neutral-100">
        {trail.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-[11.5px] leading-5 text-neutral-500">
        {trail.description}
      </p>

      <div className="mt-auto pt-4">
        <TrailMiniGraph nodes={trail.nodes} active={active} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.055] pt-3 font-mono text-[9px] uppercase tracking-[0.15em] text-neutral-600">
        <span>{trail.nodes.length} notes</span>
        <span>{trail.updatedAt}</span>
        <span className={trail.saved ? "text-neutral-400" : ""}>
          {trail.saved ? "saved" : "open"}
        </span>
      </div>
    </motion.button>
  );
}

export function DashboardWorkspace({
  accountSlot,
  librarySlot,
  embeddingLabel,
}: {
  accountSlot: ReactNode;
  librarySlot: ReactNode;
  embeddingLabel: string;
}) {
  const [notes, setNotes] = useState<Note[]>(seedNotes);
  const [trails, setTrails] = useState<Trail[]>(seedTrails);
  const [activeTrailId, setActiveTrailId] = useState<string | null>(
    "trail-recall",
  );
  const [hydrated, setHydrated] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [uploadTab, setUploadTab] = useState<UploadTab>("pdf");
  const [uploadDraft, setUploadDraft] = useState<{
    title?: string;
    content?: string;
  } | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [focusedNodeIndex, setFocusedNodeIndex] = useState(0);
  const [trailSequenceIds, setTrailSequenceIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);

    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }

    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored) {
          const parsed = JSON.parse(stored) as StoredWorkspace;

          if (Array.isArray(parsed.notes) && Array.isArray(parsed.trails)) {
            setNotes(parsed.notes);
            setTrails(parsed.trails);
            setActiveTrailId(parsed.activeTrailId ?? null);
          }
        }
      } catch {
        // A malformed local cache should never block the workspace.
      } finally {
        setHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ notes, trails, activeTrailId }),
      );
    } catch {
      // Storage may be unavailable in private or restricted contexts.
    }
  }, [activeTrailId, hydrated, notes, trails]);

  const selectedTrail = selectedTrailId
    ? (trails.find((trail) => trail.id === selectedTrailId) ?? null)
    : null;
  const selectedNote = selectedNoteId
    ? (notes.find((note) => note.id === selectedNoteId) ?? null)
    : null;

  const orderedTrails = useMemo(() => {
    return [...trails].sort((left, right) => {
      const leftActive = left.id === activeTrailId ? 1 : 0;
      const rightActive = right.id === activeTrailId ? 1 : 0;
      return rightActive - leftActive;
    });
  }, [activeTrailId, trails]);

  const navigationTrails = useMemo(() => {
    const ids =
      trailSequenceIds.length > 0
        ? [...trailSequenceIds]
        : orderedTrails.map((trail) => trail.id);

    if (selectedTrail && !ids.includes(selectedTrail.id)) {
      ids.push(selectedTrail.id);
    }

    return ids
      .map((id) => trails.find((trail) => trail.id === id))
      .filter((trail): trail is Trail => Boolean(trail));
  }, [orderedTrails, selectedTrail, trailSequenceIds, trails]);

  const safeFocusedNodeIndex =
    selectedTrail && selectedTrail.nodes.length > 0
      ? Math.min(focusedNodeIndex, selectedTrail.nodes.length - 1)
      : 0;
  const selectedTrailPosition = selectedTrail
    ? Math.max(
        1,
        navigationTrails.findIndex((trail) => trail.id === selectedTrail.id) + 1,
      )
    : 0;
  const focusedNode =
    selectedTrail && selectedTrail.nodes.length > 0
      ? selectedTrail.nodes[safeFocusedNodeIndex]
      : null;

  const anyOverlay =
    overlay !== null || selectedTrail !== null || selectedNote !== null;

  useEffect(() => {
    if (!anyOverlay) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [anyOverlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSelectedTrailId(null);
        setSelectedNoteId(null);
        setOverlay("search");
        return;
      }

      if (event.key === "Escape") {
        setOverlay(null);
        setSelectedTrailId(null);
        setSelectedNoteId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openUpload = (tab: UploadTab = "pdf", draft: typeof uploadDraft = null) => {
    setSelectedTrailId(null);
    setSelectedNoteId(null);
    setUploadTab(tab);
    setUploadDraft(draft);
    setUploadKey((current) => current + 1);
    setOverlay("upload");
  };

  const openComposer = (draft?: { title?: string; content?: string }) => {
    openUpload("note", draft ?? null);
  };

  const openNote = useCallback((note: Note) => {
    setOverlay(null);
    setSelectedTrailId(null);
    setSelectedNoteId(note.id);
  }, []);

  const openNoteById = (noteId: string) => {
    const note = notes.find((item) => item.id === noteId);

    if (note) {
      openNote(note);
    }
  };

  const openTrail = (trail: Trail) => {
    setOverlay(null);
    setSelectedNoteId(null);
    setTrailSequenceIds(orderedTrails.map((item) => item.id));
    setSelectedTrailId(trail.id);
    setFocusedNodeIndex(0);
  };

  const togglePin = (note: Note) => {
    setNotes((current) =>
      current.map((item) =>
        item.id === note.id ? { ...item, pinned: !item.pinned } : item,
      ),
    );
    notify(note.pinned ? "Note unpinned." : "Note pinned to your workspace.");
  };

  const toggleTrailSave = (trail: Trail) => {
    setTrails((current) =>
      current.map((item) =>
        item.id === trail.id ? { ...item, saved: !item.saved } : item,
      ),
    );
    notify(trail.saved ? "Trail removed from saved." : "Trail saved to archive.");
  };

  const resumeTrail = (trail: Trail) => {
    setActiveTrailId(trail.id);
    setTrails((current) =>
      current.map((item) =>
        item.id === trail.id
          ? { ...item, saved: true, updatedAt: "Just now" }
          : item,
      ),
    );
    notify(`“${trail.title}” is now your active trail.`);
  };

  const branchFromNote = (note: Note) => {
    openComposer({
      title: `Branch from ${note.title}`.slice(0, 200),
      content: `${note.excerpt}\n\n`,
    });
  };

  const branchFromNode = (node: TrailNode) => {
    openComposer({
      title: `Branch from ${node.label}`.slice(0, 200),
      content: `${node.label}\n\n`,
    });
  };

  const navigateTrail = useCallback(
    (direction: 1 | -1) => {
      if (!selectedTrailId || navigationTrails.length === 0) {
        return;
      }

      const currentIndex = navigationTrails.findIndex(
        (trail) => trail.id === selectedTrailId,
      );

      if (currentIndex === -1) {
        return;
      }

      const nextIndex =
        (currentIndex + direction + navigationTrails.length) %
        navigationTrails.length;

      setSelectedTrailId(navigationTrails[nextIndex].id);
      setFocusedNodeIndex(0);
    },
    [navigationTrails, selectedTrailId],
  );

  const navigateNode = useCallback(
    (direction: 1 | -1) => {
      if (!selectedTrail || selectedTrail.nodes.length === 0) {
        return;
      }

      setFocusedNodeIndex((current) => {
        const count = selectedTrail.nodes.length;
        const normalized = ((current % count) + count) % count;

        return (normalized + direction + count) % count;
      });
    },
    [selectedTrail],
  );

  const openFocusedNote = useCallback(() => {
    if (!focusedNode) {
      return;
    }

    const note = notes.find((item) => item.id === focusedNode.noteId);

    if (note) {
      openNote(note);
    }
  }, [focusedNode, notes, openNote]);

  useEffect(() => {
    if (!selectedTrail || overlay !== null || selectedNoteId !== null) {
      return;
    }

    const onTrailKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTyping =
        target?.matches("input, textarea, select, [contenteditable='true']") ??
        false;

      if (
        !isTyping &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        navigateNode(event.key === "ArrowRight" ? 1 : -1);
        return;
      }

      if (event.key === "Enter") {
        const isInteractive =
          target?.closest(
            "button, a, input, textarea, select, [contenteditable='true']",
          ) ?? false;

        if (!isInteractive) {
          event.preventDefault();
          openFocusedNote();
        }
      }
    };

    window.addEventListener("keydown", onTrailKeyDown);
    return () => window.removeEventListener("keydown", onTrailKeyDown);
  }, [navigateNode, openFocusedNote, overlay, selectedNoteId, selectedTrail]);

  const handleNoteCreated = (created: NoteCreated) => {
    const excerpt =
      created.content.replace(/\s+/g, " ").trim().slice(0, 170) +
      (created.content.length > 170 ? "…" : "");

    const note: Note = {
      id: created.documentId,
      title: created.title,
      excerpt,
      body: created.content,
      tag: "New note",
      kind: "thought",
      updatedAt: "Just now",
      pinned: false,
    };

    const trail: Trail = {
      id: `trail-${created.documentId}`,
      title: created.title,
      description: "A new path, opened from a single thought.",
      updatedAt: "Just now",
      saved: true,
      nodes: [
        {
          id: `node-${created.documentId}`,
          noteId: created.documentId,
          label: created.title,
          kind: "thought",
          relation: "The beginning",
        },
      ],
    };

    setNotes((current) => [note, ...current]);
    setTrails((current) => [trail, ...current]);
    setActiveTrailId(trail.id);
  };

  const pinnedNotes = useMemo(
    () => notes.filter((note) => note.pinned).slice(0, 4),
    [notes],
  );

  const recentTrails = orderedTrails.slice(0, 4);
  const noteMap = useMemo(() => new Map(notes.map((note) => [note.id, note])), [
    notes,
  ]);
  const visibleAssociations = seedAssociations
    .map((association) => ({
      association,
      from: noteMap.get(association.fromId),
      to: noteMap.get(association.toId),
    }))
    .filter(
      (
        entry,
      ): entry is {
        association: (typeof seedAssociations)[number];
        from: Note;
        to: Note;
      } => Boolean(entry.from && entry.to),
    )
    .slice(0, 4);

  const navActions = [
    {
      label: "Search",
      icon: SearchIcon,
      onClick: () => setOverlay("search"),
      kbd: "⌘K",
    },
    {
      label: "Previous trails",
      icon: TrailsIcon,
      onClick: () => setOverlay("trails"),
    },
    {
      label: "Upload",
      icon: UploadIcon,
      onClick: () => openUpload("pdf"),
      emphasized: true,
    },
    {
      label: "Support",
      icon: HelpIcon,
      onClick: () => setOverlay("support"),
    },
  ];

  return (
    <div className="relative z-20 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.055] bg-ink-950/30 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.4rem] w-full max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              aria-label="memex.ai dashboard home"
              className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <BrandMark />
            </Link>
            <span className="hidden h-5 w-px bg-white/[0.08] xl:block" />
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-600 xl:block">
              associative workspace
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <nav
              aria-label="Workspace actions"
              className="flex items-center gap-1.5"
            >
              {navActions.map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    title={action.label}
                    aria-label={action.label}
                    className={`group inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 text-[11.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-3 ${
                      action.emphasized
                        ? "border-white/[0.16] bg-white/[0.07] text-white hover:border-white/25 hover:bg-white/[0.11]"
                        : "border-white/[0.08] bg-white/[0.025] text-neutral-400 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <Icon className="size-4" />
                    <span className="hidden md:inline">{action.label}</span>
                    {action.kbd ? (
                      <kbd className="hidden rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 font-mono text-[8px] text-neutral-500 lg:inline">
                        {action.kbd}
                      </kbd>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <span className="mx-1 hidden h-5 w-px bg-white/[0.08] sm:block" />

            <details className="group relative">
              <summary
                aria-label="Account menu"
                className="flex size-9 cursor-pointer list-none items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] text-[11px] font-medium text-neutral-300 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 [&::-webkit-details-marker]:hidden"
              >
                M
              </summary>

              <div className="absolute right-0 top-[calc(100%+0.65rem)] w-64 rounded-2xl border border-white/[0.1] bg-ink-900/95 p-2 shadow-[0_30px_80px_-25px_rgba(0,0,0,1)] backdrop-blur-2xl">
                <div className="rounded-xl px-3 py-2.5">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-neutral-600">
                    Signed in as
                  </p>
                  <div className="mt-1.5 truncate text-[11.5px] text-neutral-300">
                    {accountSlot}
                  </div>
                </div>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11.5px] text-neutral-400 transition hover:bg-white/[0.055] hover:text-white"
                  >
                    <LogOutIcon className="size-4" />
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-10 sm:px-6 lg:px-8">
        <DashboardHero
          onBegin={(prompt) =>
            openComposer(prompt ? { content: prompt } : undefined)
          }
          onSearch={() => setOverlay("search")}
        />

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pb-12 text-[10.5px] text-neutral-600 sm:pb-14">
          <span>
            <span className="font-mono text-neutral-300">{notes.length}</span>{" "}
            notes
          </span>
          <span className="size-1 rounded-full bg-white/15" />
          <span>
            <span className="font-mono text-neutral-300">{trails.length}</span>{" "}
            trails
          </span>
          <span className="size-1 rounded-full bg-white/15" />
          <span>
            <span className="font-mono text-neutral-300">
              {seedAssociations.length}
            </span>{" "}
            live associations
          </span>
          <span className="hidden size-1 rounded-full bg-white/15 sm:block" />
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="size-1.5 rounded-full bg-white/60" />
            private by default
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="min-w-0 space-y-6 lg:col-span-8">
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-neutral-600">
                    Continue where you left off
                  </p>
                  <h2 className="mt-2 text-[1.15rem] font-semibold tracking-[-0.025em] text-white">
                    Recent trails
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOverlay("trails")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-neutral-500 transition hover:text-white"
                >
                  View archive
                  <ChevronRightIcon className="size-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {recentTrails.map((trail, index) => (
                  <TrailCard
                    key={trail.id}
                    trail={trail}
                    active={trail.id === activeTrailId}
                    index={index}
                    onOpen={() => openTrail(trail)}
                  />
                ))}
              </div>
            </section>

            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="workspace-panel overflow-hidden p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-600">
                    Associative index
                  </p>
                  <h2 className="mt-2 text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
                    How your thoughts connect
                  </h2>
                </div>
                <p className="text-[10.5px] text-neutral-600">
                  Hover a note to trace its edges. Click to open.
                </p>
              </div>

              <div className="mt-3 -mx-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:-mx-4 lg:overflow-visible">
                <div className="min-w-[46rem] lg:min-w-0">
                  <AssociativeMap
                    nodes={mapNodes}
                    edges={mapEdges}
                    onOpenNote={openNoteById}
                  />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-neutral-600 lg:hidden">
                Swipe to explore the full map.
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-3 font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-600">
                <span className="flex items-center gap-2">
                  <span className="h-px w-5 bg-neutral-400/50" />
                  strong association
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-px w-5 border-t border-dashed border-neutral-600/60" />
                  tentative link
                </span>
                <span className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full border border-neutral-500" />
                  note
                </span>
                <span className="flex items-center gap-2">
                  <span className="size-1.5 rounded-sm border border-neutral-500" />
                  source
                </span>
              </div>
            </motion.section>
          </div>

          <aside className="min-w-0 space-y-6 lg:col-span-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="workspace-panel p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-600">
                    Quick access
                  </p>
                  <h2 className="mt-2 text-[1rem] font-semibold tracking-[-0.02em] text-white">
                    Pinned notes
                  </h2>
                </div>
                <span className="grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-neutral-500">
                  <PinIcon className="size-4" />
                </span>
              </div>

              <div className="mt-4 space-y-1.5">
                {pinnedNotes.length > 0 ? (
                  pinnedNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => openNote(note)}
                      className="group flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/[0.04]"
                    >
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-400 transition group-hover:bg-white" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-neutral-200 transition group-hover:text-white">
                          {note.title}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-[10.5px] leading-4 text-neutral-500">
                          {note.excerpt}
                        </span>
                        <span className="mt-1.5 block font-mono text-[8.5px] uppercase tracking-[0.14em] text-neutral-600">
                          {note.tag}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center">
                    <PinIcon className="mx-auto size-4 text-neutral-600" />
                    <p className="mt-2 text-[11.5px] text-neutral-500">
                      Pin a note from any trail to keep it close.
                    </p>
                  </div>
                )}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="workspace-panel p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-600">
                    Nearby
                  </p>
                  <h2 className="mt-2 text-[1rem] font-semibold tracking-[-0.02em] text-white">
                    Active associations
                  </h2>
                </div>
                <span className="grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-neutral-500">
                  <LinkIcon className="size-4" />
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {visibleAssociations.map(({ association, from, to }) => (
                  <button
                    key={association.id}
                    type="button"
                    onClick={() => openNote(from)}
                    className="group w-full rounded-xl border border-white/[0.055] bg-white/[0.018] p-3 text-left transition hover:border-white/[0.13] hover:bg-white/[0.038]"
                  >
                    <div className="flex items-center gap-2 text-[10.5px] text-neutral-400">
                      <span className="truncate">{from.title}</span>
                      <LinkIcon className="size-3 shrink-0 text-neutral-600" />
                      <span className="truncate">{to.title}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-neutral-600">
                      {association.hint}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span
                          className="block h-full rounded-full bg-white/35 transition-all duration-500 group-hover:bg-white/55"
                          style={{ width: `${association.strength}%` }}
                        />
                      </span>
                      <span className="font-mono text-[8.5px] text-neutral-600">
                        {association.strength}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => openComposer()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.09] px-3 py-2.5 text-[11px] text-neutral-500 transition hover:border-white/[0.17] hover:bg-white/[0.025] hover:text-neutral-200"
              >
                <PlusIcon className="size-3.5" />
                Weave a new connection
              </button>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="workspace-panel p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-600">
                    Your sources
                  </p>
                  <h2 className="mt-2 text-[1rem] font-semibold tracking-[-0.02em] text-white">
                    Library
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-neutral-500">
                  <span className="size-1 rounded-full bg-white/60" />
                  private
                </span>
              </div>

              <div className="mt-3">{librarySlot}</div>

              <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
                <SparkIcon className="size-3 text-neutral-600" />
                <p className="truncate font-mono text-[8.5px] uppercase tracking-[0.13em] text-neutral-600">
                  {embeddingLabel}
                </p>
              </div>
            </motion.section>
          </aside>
        </div>

        <footer className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/[0.055] pt-5 sm:flex-row sm:items-center">
          <p className="text-[10.5px] text-neutral-600">
            memex.ai · associative memory · private by default
          </p>
          <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-neutral-700">
            after Vannevar Bush, 1945
          </p>
        </footer>
      </div>

      <CommandPalette
        open={overlay === "search"}
        onClose={() => setOverlay(null)}
        notes={notes}
        trails={trails}
        onOpenNote={openNote}
        onOpenTrail={openTrail}
        onUpload={() => openUpload("pdf")}
        onNewNote={() => openComposer()}
        onOpenTrails={() => setOverlay("trails")}
        onSupport={() => setOverlay("support")}
      />

      <TrailsDrawer
        open={overlay === "trails"}
        onClose={() => setOverlay(null)}
        trails={orderedTrails}
        activeTrailId={activeTrailId}
        onOpenTrail={openTrail}
        onNewNote={() => openComposer()}
      />

      <UploadDialog
        key={uploadKey}
        open={overlay === "upload"}
        onClose={() => setOverlay(null)}
        initialTab={uploadTab}
        initialDraft={uploadDraft}
        onNoteCreated={handleNoteCreated}
        onNotify={notify}
      />

      <SupportDialog
        open={overlay === "support"}
        onClose={() => setOverlay(null)}
      />

      <TrailDetailDialog
        trail={selectedTrail}
        notes={notes}
        activeTrailId={activeTrailId}
        focusedNodeIndex={safeFocusedNodeIndex}
        trailPosition={{
          current: selectedTrailPosition,
          total: navigationTrails.length,
        }}
        onPreviousTrail={() => navigateTrail(-1)}
        onNextTrail={() => navigateTrail(1)}
        onClose={() => setSelectedTrailId(null)}
        onResume={resumeTrail}
        onToggleSave={toggleTrailSave}
        onOpenNote={openNote}
        onBranch={branchFromNode}
      />

      <NoteDetailDrawer
        note={selectedNote}
        notes={notes}
        associations={seedAssociations}
        onClose={() => setSelectedNoteId(null)}
        onOpenNote={openNote}
        onTogglePin={togglePin}
        onBranch={branchFromNote}
      />

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4"
      >
        <AnimatePresence>
          {toast ? (
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-full border border-white/[0.12] bg-ink-900/90 px-4 py-2 text-[11.5px] text-neutral-200 shadow-[0_20px_60px_-20px_rgba(0,0,0,1)] backdrop-blur-xl"
            >
              {toast}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
