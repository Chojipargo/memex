import type { Note, Trail, TrailNode } from "@/lib/dashboard/data";
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
    excerpt: step.excerpt,
    body: step.excerpt,
    tag: `${step.documentTitle} · p.${step.page}`,
    kind: "quote",
    updatedAt: "Just now",
    pinned: false,
    source: step.documentTitle,
  }));

  const nodes: TrailNode[] = api.steps.map((step) => ({
    id: `${trailId}-step-${step.position}`,
    noteId: `chunk-${step.chunkId}`,
    label: step.documentTitle,
    kind: "quote",
    relation: step.note,
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
    },
  };
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
