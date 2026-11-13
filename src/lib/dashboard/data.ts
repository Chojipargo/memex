import type { Provenance, SourceOrigin } from "@/lib/rag/types";

export type NoteKind = "thought" | "quote" | "question" | "source";

export type Note = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  tag: string;
  kind: NoteKind;
  updatedAt: string;
  pinned: boolean;
  source?: string;
  /** Set on notes that cite a library chunk (generated trail steps). */
  chunkId?: number;
  /** AI summary of the cited passage. */
  gist?: string;
  /** Verified verbatim key quote from the cited passage. */
  quote?: string;
  /** Personal library or web research; older cached notes default to library. */
  sourceOrigin?: SourceOrigin;
  sourceUrl?: string;
  sourceDomain?: string;
  sourceProvider?: string;
  retrievedAt?: string;
};

export type TrailNode = {
  id: string;
  noteId: string;
  label: string;
  kind: NoteKind;
  relation: string;
  sourceOrigin?: SourceOrigin;
  /** Generated trails: the link from the previous step to this one. */
  linkId?: string;
  /** Generated trails: the reader's own note on this step. */
  annotation?: string;
};

export type Trail = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  saved: boolean;
  nodes: TrailNode[];
  /** Derived from the trail's steps when it was generated. */
  origin?: Provenance;
  /** For a side trail: the trail it branched from. */
  parent?: { apiTrailId: string; title: string };
};

export type Association = {
  id: string;
  fromId: string;
  toId: string;
  strength: number;
  hint: string;
};

export type MapNode = {
  id: string;
  noteId: string;
  label: string;
  kind: NoteKind;
  x: number;
  y: number;
};

export type MapEdge = {
  id: string;
  from: string;
  to: string;
  strength: number;
};

export const mapNodes: MapNode[] = [
  {
    id: "map-bush",
    noteId: "associative-indexing",
    label: "Associative indexing",
    kind: "quote",
    x: 96,
    y: 108,
  },
  {
    id: "map-trail",
    noteId: "trail-not-folder",
    label: "Trails over folders",
    kind: "thought",
    x: 260,
    y: 62,
  },
  {
    id: "map-recall",
    noteId: "recall-over-storage",
    label: "Design for recall",
    kind: "thought",
    x: 412,
    y: 120,
  },
  {
    id: "map-zettel",
    noteId: "zettelkasten",
    label: "Zettelkasten",
    kind: "source",
    x: 556,
    y: 58,
  },
  {
    id: "map-interface",
    noteId: "interface-disappears",
    label: "Invisible interface",
    kind: "thought",
    x: 664,
    y: 150,
  },
  {
    id: "map-attention",
    noteId: "attention-residues",
    label: "Attention residues",
    kind: "thought",
    x: 210,
    y: 238,
  },
  {
    id: "map-spaced",
    noteId: "spaced-repetition",
    label: "Trail replay",
    kind: "thought",
    x: 394,
    y: 246,
  },
  {
    id: "map-forking",
    noteId: "forking-paths",
    label: "Forking paths",
    kind: "source",
    x: 582,
    y: 232,
  },
];

export const mapEdges: MapEdge[] = [
  { id: "edge-1", from: "map-bush", to: "map-trail", strength: 96 },
  { id: "edge-2", from: "map-bush", to: "map-zettel", strength: 94 },
  { id: "edge-3", from: "map-trail", to: "map-recall", strength: 84 },
  { id: "edge-4", from: "map-recall", to: "map-interface", strength: 72 },
  { id: "edge-5", from: "map-zettel", to: "map-interface", strength: 88 },
  { id: "edge-6", from: "map-trail", to: "map-attention", strength: 68 },
  { id: "edge-7", from: "map-recall", to: "map-spaced", strength: 81 },
  { id: "edge-8", from: "map-attention", to: "map-spaced", strength: 79 },
  { id: "edge-9", from: "map-spaced", to: "map-forking", strength: 64 },
  { id: "edge-10", from: "map-interface", to: "map-forking", strength: 59 },
  { id: "edge-11", from: "map-zettel", to: "map-forking", strength: 61 },
];

export const heroPhrases = [
  "What should we write today?",
  "Trace a new trail of thought...",
  "Connect ideas across your library...",
  "Where shall your associative trail lead?",
];

export const promptSuggestions = [
  "What are the key ideas in my library?",
  "Where do my sources disagree?",
  "What should I read next?",
];
