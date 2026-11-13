/** Client-safe shapes for published (public) trails. */

import type { Provenance, SourceOrigin } from "@/lib/rag/types";

export type PublishedStep = {
  position: number;
  note: string;
  gist: string | null;
  quote: string | null;
  sourceTitle: string;
  page: number;
  sourceOrigin: SourceOrigin;
  /** Only set for web sources; private uploads never expose a URL. */
  sourceUrl: string | null;
  sourceDomain: string | null;
};

export type PublishedTrailSummary = {
  id: string;
  title: string;
  question: string;
  stepCount: number;
  origin: Provenance;
  learnerCount: number;
  publishedAt: string;
  updatedAt: string;
};

export type PublishedTrail = PublishedTrailSummary & {
  steps: PublishedStep[];
};

/** The signed-in owner's view of whether a trail is public. */
export type TrailPublication = {
  publishedId: string;
  stepCount: number;
  learnerCount: number;
  publishedAt: string;
  updatedAt: string;
};

export type ExploreSort = "popular" | "recent";

export function parseExploreSort(value: unknown): ExploreSort {
  return value === "recent" ? "recent" : "popular";
}

export function publishedTrailPath(id: string): string {
  return `/explore/${id}`;
}

/** Dashboard link that asks a published trail's question in your own library. */
export function askInLibraryPath(question: string, publishedId: string): string {
  const params = new URLSearchParams({ ask: question, from: publishedId });
  return `/dashboard?${params.toString()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asInteger(value: unknown, minimum = 0): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= minimum ? value : null;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
  }

  return null;
}

function parseProvenance(value: unknown): Provenance {
  return value === "web" || value === "hybrid" ? value : "library";
}

/** Only http(s) URLs are rendered as links. */
function safeHttpUrl(value: unknown): string | null {
  const raw = asNonEmptyString(value);

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parsePublishedSummary(value: unknown): PublishedTrailSummary | null {
  const row = asRecord(value);

  if (!row) {
    return null;
  }

  const id = asNonEmptyString(row.id);
  const title = asNonEmptyString(row.title);
  const question = asNonEmptyString(row.question);
  const stepCount = asInteger(row.step_count, 1);
  const learnerCount = asInteger(row.learner_count, 0);
  const publishedAt = asNonEmptyString(row.published_at);
  const updatedAt = asNonEmptyString(row.updated_at) ?? publishedAt;

  if (
    !id ||
    !title ||
    !question ||
    stepCount === null ||
    learnerCount === null ||
    !publishedAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    title,
    question,
    stepCount,
    origin: parseProvenance(row.origin),
    learnerCount,
    publishedAt,
    updatedAt,
  };
}

export function parsePublishedSteps(value: unknown): PublishedStep[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const steps: PublishedStep[] = [];

  for (const raw of value) {
    const step = asRecord(raw);

    if (!step) {
      return null;
    }

    const position = asInteger(step.position, 1);
    const note = asNonEmptyString(step.note);
    const sourceTitle = asNonEmptyString(step.sourceTitle);
    const page = asInteger(step.page, 1);

    if (position === null || !note || !sourceTitle || page === null) {
      return null;
    }

    const sourceOrigin: SourceOrigin = step.sourceOrigin === "web" ? "web" : "library";
    const sourceUrl = sourceOrigin === "web" ? safeHttpUrl(step.sourceUrl) : null;

    steps.push({
      position,
      note,
      gist: asNonEmptyString(step.gist),
      quote: asNonEmptyString(step.quote),
      sourceTitle,
      page,
      sourceOrigin,
      sourceUrl,
      sourceDomain: sourceUrl ? asNonEmptyString(step.sourceDomain) : null,
    });
  }

  return steps.sort((left, right) => left.position - right.position);
}

export function parseTrailPublication(value: unknown): TrailPublication | null {
  const row = asRecord(Array.isArray(value) ? value[0] : value);

  if (!row) {
    return null;
  }

  const publishedId = asNonEmptyString(row.published_id);
  const stepCount = asInteger(row.step_count, 1);
  const learnerCount = asInteger(row.learner_count, 0);
  const publishedAt = asNonEmptyString(row.published_at);
  const updatedAt = asNonEmptyString(row.updated_at);

  if (!publishedId || stepCount === null || learnerCount === null || !publishedAt || !updatedAt) {
    return null;
  }

  return { publishedId, stepCount, learnerCount, publishedAt, updatedAt };
}
