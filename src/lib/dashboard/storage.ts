import {
  seedNotes,
  seedTrails,
  type Note,
  type NoteKind,
  type Trail,
  type TrailNode,
} from "@/lib/dashboard/data";

export const WORKSPACE_STORAGE_KEY = "memex.workspace.v1";

export type StoredWorkspace = {
  notes: Note[];
  trails: Trail[];
  activeTrailId: string | null;
};

const NOTE_KINDS = new Set<NoteKind>(["thought", "quote", "question", "source"]);
const SEED_NOTE_IDS = new Set(seedNotes.map((note) => note.id));
const SEED_TRAIL_IDS = new Set(seedTrails.map((trail) => trail.id));

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNoteKind(value: unknown): value is NoteKind {
  return isString(value) && NOTE_KINDS.has(value as NoteKind);
}

function parseNote(value: unknown): Note | null {
  const r = asRecord(value);

  if (
    !r ||
    !isString(r.id) ||
    !isString(r.title) ||
    !isString(r.excerpt) ||
    !isString(r.body) ||
    !isString(r.tag) ||
    !isNoteKind(r.kind) ||
    !isString(r.updatedAt) ||
    typeof r.pinned !== "boolean" ||
    (r.source !== undefined && !isString(r.source))
  ) {
    return null;
  }

  return {
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    body: r.body,
    tag: r.tag,
    kind: r.kind,
    updatedAt: r.updatedAt,
    pinned: r.pinned,
    ...(r.source !== undefined ? { source: r.source } : {}),
  };
}

function parseNode(value: unknown): TrailNode | null {
  const r = asRecord(value);

  if (
    !r ||
    !isString(r.id) ||
    !isString(r.noteId) ||
    !isString(r.label) ||
    !isNoteKind(r.kind) ||
    !isString(r.relation)
  ) {
    return null;
  }

  return {
    id: r.id,
    noteId: r.noteId,
    label: r.label,
    kind: r.kind,
    relation: r.relation,
  };
}

function parseTrail(value: unknown): Trail | null {
  const r = asRecord(value);

  if (
    !r ||
    !isString(r.id) ||
    !isString(r.title) ||
    !isString(r.description) ||
    !isString(r.updatedAt) ||
    typeof r.saved !== "boolean" ||
    !Array.isArray(r.nodes)
  ) {
    return null;
  }

  const nodes: TrailNode[] = [];

  for (const rawNode of r.nodes) {
    const node = parseNode(rawNode);

    if (!node) {
      return null;
    }

    nodes.push(node);
  }

  return {
    id: r.id,
    title: r.title,
    description: r.description,
    updatedAt: r.updatedAt,
    saved: r.saved,
    nodes,
  };
}

/**
 * Read the cached workspace. Malformed items are skipped, and the demo seed
 * notes and trails that older versions stored are filtered out.
 */
export function readStoredWorkspace(raw: string | null): StoredWorkspace | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const record = asRecord(parsed);

  if (!record || !Array.isArray(record.notes) || !Array.isArray(record.trails)) {
    return null;
  }

  const notes = record.notes
    .map(parseNote)
    .filter((note): note is Note => note !== null && !SEED_NOTE_IDS.has(note.id));
  const trails = record.trails
    .map(parseTrail)
    .filter(
      (trail): trail is Trail => trail !== null && !SEED_TRAIL_IDS.has(trail.id),
    );
  const activeTrailId =
    isString(record.activeTrailId) &&
    trails.some((trail) => trail.id === record.activeTrailId)
      ? record.activeTrailId
      : null;

  return { notes, trails, activeTrailId };
}
