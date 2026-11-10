export type TrailApiStep = {
  position: number;
  chunkId: number;
  documentId: string;
  documentTitle: string;
  page: number;
  note: string;
  excerpt: string;
};

export type TrailApi = {
  id: string;
  question: string;
  title: string;
  model: string;
  createdAt: string;
  steps: TrailApiStep[];
};

export type TrailSummary = {
  id: string;
  title: string;
  question: string;
  createdAt: string;
  stepCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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

function parseStep(value: unknown): TrailApiStep | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const position = asInteger(record.position, 1);
  const chunkId = asInteger(record.chunkId, 1);
  const documentId = asNonEmptyString(record.documentId);
  const documentTitle = asNonEmptyString(record.documentTitle);
  const page = asInteger(record.page, 1);
  const note = asString(record.note);
  const excerpt = asString(record.excerpt);

  if (
    position === null ||
    chunkId === null ||
    !documentId ||
    !documentTitle ||
    page === null ||
    note === null ||
    excerpt === null
  ) {
    return null;
  }

  return {
    position,
    chunkId,
    documentId,
    documentTitle,
    page,
    note,
    excerpt,
  };
}

export function parseTrailApiResponse(value: unknown): TrailApi | null {
  const root = asRecord(value);
  const trail = root ? asRecord(root.trail) : null;

  if (!trail) {
    return null;
  }

  const id = asNonEmptyString(trail.id);
  const question = asNonEmptyString(trail.question);
  const title = asNonEmptyString(trail.title);
  const model = asNonEmptyString(trail.model);
  const createdAt = asNonEmptyString(trail.createdAt);
  const rawSteps = trail.steps;

  if (
    !id ||
    !question ||
    !title ||
    !model ||
    !createdAt ||
    !Array.isArray(rawSteps)
  ) {
    return null;
  }

  const steps: TrailApiStep[] = [];

  for (const rawStep of rawSteps) {
    const step = parseStep(rawStep);

    if (!step) {
      return null;
    }

    steps.push(step);
  }

  return { id, question, title, model, createdAt, steps };
}

export function readApiError(value: unknown): string | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const error = asNonEmptyString(record.error);
  return error;
}

export type TrailQuestionResult =
  | { ok: true; trail: TrailApi }
  | { ok: false; message: string; lowCoverage: boolean };

/**
 * POST a question to a trail endpoint (`/api/trails` or
 * `/api/trails/:id/continue`) and validate the JSON that comes back.
 * A 422 means the library does not cover the question.
 */
export async function postTrailQuestion(
  url: string,
  question: string,
): Promise<TrailQuestionResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch {
    return {
      ok: false,
      message: "Could not reach the server. Check your connection and try again.",
      lowCoverage: false,
    };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      message:
        readApiError(payload) ?? `The request failed (${response.status}). Try again.`,
      lowCoverage: response.status === 422,
    };
  }

  const trail = parseTrailApiResponse(payload);

  if (!trail) {
    return {
      ok: false,
      message: "The trail came back in an unexpected shape. Try again.",
      lowCoverage: false,
    };
  }

  return { ok: true, trail };
}
