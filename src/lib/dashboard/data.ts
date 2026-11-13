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
