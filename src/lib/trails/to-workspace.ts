import type { Note, Trail, TrailNode } from "@/lib/dashboard/data";
import { provenanceOf } from "@/lib/rag/types";
import type { TrailApi } from "@/lib/trails/api";

const GENERATED_PREFIX = "gen-";

/** Workspace id for a generated trail. */
export function generatedTrailId(apiTrailId: string): string {
  return `${GENERATED_PREFIX}${apiTrailId}`;
}

/** The API uuid behind a generated workspace trail, or null for hand-built trails. */
export function apiTrailIdOf(trail: Pick<Trail, "id">): string | null {
  return trail.id.startsWith(GENERATED_PREFIX)
    ? trail.id.slice(GENERATED_PREFIX.length)
    : null;
}

/**
 * Map an API trail onto workspace data: one quote Note per cited chunk and
 * one Trail whose node relations carry the model's "why this comes next" note.
 */
export function trailToWorkspace(api: TrailApi): { notes: Note[]; trail: Trail } {
  const trailId = generatedTrailId(api.id);

  const notes: Note[] = api.steps.map((step) => ({
    id: `chunk-${step.chunkId}`,
    title: step.documentTitle,
    excerpt: step.gist ?? step.quote ?? step.excerpt,
    body: step.content,
    tag: `${step.documentTitle} · p.${step.page}`,
    kind: "quote",
    updatedAt: "Just now",
    pinned: false,
    source: step.documentTitle,
    chunkId: step.chunkId,
    sourceOrigin: step.sourceOrigin,
    ...(step.sourceUrl ? { sourceUrl: step.sourceUrl } : {}),
    ...(step.sourceDomain ? { sourceDomain: step.sourceDomain } : {}),
    ...(step.sourceProvider ? { sourceProvider: step.sourceProvider } : {}),
    ...(step.retrievedAt ? { retrievedAt: step.retrievedAt } : {}),
    ...(step.gist ? { gist: step.gist } : {}),
    ...(step.quote ? { quote: step.quote } : {}),
  }));

  const nodes: TrailNode[] = api.steps.map((step) => ({
    id: `${trailId}-step-${step.position}`,
    noteId: `chunk-${step.chunkId}`,
    label: step.documentTitle,
    kind: "quote",
    relation: step.note,
    sourceOrigin: step.sourceOrigin,
    ...(step.linkId ? { linkId: step.linkId } : {}),
    ...(step.annotation ? { annotation: step.annotation } : {}),
  }));

  return {
    notes,
    trail: {
      id: trailId,
      title: api.title,
      description: api.question,
      updatedAt: "Just now",
      saved: true,
      nodes,
      origin: provenanceOf(api.steps.map((step) => step.sourceOrigin)),
      ...(api.parentTrailId
        ? {
            parent: {
              apiTrailId: api.parentTrailId,
              title: api.parentTitle ?? "the parent trail",
            },
          }
        : {}),
    },
  };
}

/**
 * The chunk a note cites. Older cached generated notes predate `chunkId`
 * but still carry it in their `chunk-<id>` note id.
 */
export function chunkIdOf(note: Pick<Note, "id" | "chunkId">): number | null {
  if (typeof note.chunkId === "number") {
    return note.chunkId;
  }

  const match = /^chunk-(\d+)$/.exec(note.id);
  return match ? Number(match[1]) : null;
}

/** Put incoming notes first, replacing duplicates but keeping their pinned state. */
export function mergeNotes(current: Note[], incoming: Note[]): Note[] {
  const existing = new Map(current.map((note) => [note.id, note]));
  const incomingIds = new Set(incoming.map((note) => note.id));

  return [
    ...incoming.map((note) => ({
      ...note,
      pinned: existing.get(note.id)?.pinned ?? note.pinned,
    })),
    ...current.filter((note) => !incomingIds.has(note.id)),
  ];
}

/** Replace a trail in place (keeping its saved flag) or prepend it when new. */
export function upsertTrail(current: Trail[], trail: Trail): Trail[] {
  const previous = current.find((item) => item.id === trail.id);

  if (!previous) {
    return [trail, ...current];
  }

  return current.map((item) =>
    item.id === trail.id ? { ...trail, saved: previous.saved } : item,
  );
}
