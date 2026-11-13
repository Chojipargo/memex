import "server-only";

import { saveWebSources } from "@/lib/rag/ingest";
import type { TrailProgress } from "@/lib/rag/types";
import { extractUrl, searchWeb } from "@/lib/rag/web";
import type { TrailApi } from "@/lib/trails/api";
import {
  continueTrail,
  type ContinuedTrail,
  type GeneratedTrail,
  generateTrail,
} from "@/lib/trails/generate";
import {
  findCandidates,
  hasCoverage,
  type MatchedChunk,
  type ServerSupabase,
} from "@/lib/trails/server";
import { TrailDeadline } from "@/lib/trails/timeouts";

export type HybridTrailMode = "library" | "web" | "hybrid";

export class HybridTrailError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "HybridTrailError";
    this.status = status;
  }
}

export type HybridTrailResult = {
  generated: GeneratedTrail;
  candidates: MatchedChunk[];
  mode: HybridTrailMode;
};

export type HybridContinuationResult = {
  continued: ContinuedTrail;
  candidates: MatchedChunk[];
  mode: HybridTrailMode;
};

type Progress = (progress: TrailProgress) => void;

const SEARCHING: TrailProgress = {
  stage: "searching",
  message: "Searching personal trails...",
};

const WEB_FALLBACK: TrailProgress = {
  stage: "researching",
  message: "Information not found locally, researching external sources...",
};

const WEB_MANUAL: TrailProgress = {
  stage: "researching",
  message: "Researching authoritative web sources...",
};

const WEAVING: TrailProgress = {
  stage: "weaving",
  message: "Weaving new trail nodes...",
};

const MAX_CANDIDATES = 30;
// Below the coverage bar, library passages are only blended into a web-backed
// continuation when they are at least loosely on topic (above the ~0.5 noise
// floor described next to TRAIL_COVERAGE_THRESHOLD).
const LOCAL_BLEND_FLOOR = 0.55;

function dedupeCandidates(
  candidates: ReadonlyArray<MatchedChunk>,
): MatchedChunk[] {
  const byChunk = new Map<number, MatchedChunk>();

  for (const candidate of candidates) {
    if (!byChunk.has(candidate.chunkId)) {
      byChunk.set(candidate.chunkId, candidate);
    }
  }

  return [...byChunk.values()];
}

function combine(
  web: ReadonlyArray<MatchedChunk>,
  local: ReadonlyArray<MatchedChunk>,
): MatchedChunk[] {
  // Leave room for the reader's own passages when a long web result set would
  // otherwise fill every candidate slot. That keeps "hybrid" genuinely mixed.
  const webLimit =
    local.length > 0
      ? Math.max(1, Math.floor(MAX_CANDIDATES * 0.7))
      : MAX_CANDIDATES;

  return dedupeCandidates([
    ...web.slice(0, webLimit),
    ...local,
  ]).slice(0, MAX_CANDIDATES);
}

function modeOf(
  web: ReadonlyArray<MatchedChunk>,
  local: ReadonlyArray<MatchedChunk>,
): HybridTrailMode {
  if (web.length > 0 && local.length > 0) {
    return "hybrid";
  }

  return web.length > 0 ? "web" : "library";
}

async function retrieveWeb(
  supabase: ServerSupabase,
  userId: string,
  question: string,
  url: string | null | undefined,
): Promise<MatchedChunk[]> {
  const sources = url
    ? [await extractUrl(url)]
    : await searchWeb(question, 6);

  if (sources.length === 0) {
    throw new HybridTrailError(
      "I couldn't find reliable external sources for that topic. Try a more specific question or paste a URL.",
      422,
    );
  }

  const saved = await saveWebSources(supabase, userId, sources);

  if (saved.length === 0) {
    throw new HybridTrailError(
      "I found sources but could not read enough text to build a trail. Try a different topic or URL.",
      422,
    );
  }

  return saved;
}

/**
 * Build a trail from personal chunks first, automatically researching the web
 * only when local coverage is weak. Manual research always consults the web
 * and still blends in relevant personal passages.
 */
export async function buildHybridTrail({
  supabase,
  userId,
  question,
  mode = "auto",
  url,
  onProgress,
}: {
  supabase: ServerSupabase;
  userId: string;
  question: string;
  mode?: "auto" | "research";
  url?: string | null;
  onProgress?: Progress;
}): Promise<HybridTrailResult> {
  onProgress?.(SEARCHING);

  // Start the generation budget before retrieval and web research so a slow
  // provider leaves less time for Claude instead of overrunning maxDuration.
  const deadline = new TrailDeadline();
  const local = await findCandidates(supabase, question, MAX_CANDIDATES);

  if (mode === "auto" && hasCoverage(local)) {
    onProgress?.(WEAVING);

    return {
      generated: await generateTrail(question, local, deadline),
      candidates: local,
      mode: "library",
    };
  }

  onProgress?.(mode === "research" ? WEB_MANUAL : WEB_FALLBACK);

  const web = await retrieveWeb(supabase, userId, question, url);
  const candidates = combine(web, local);

  onProgress?.(WEAVING);

  return {
    generated: await generateTrail(question, candidates, deadline),
    candidates,
    mode: modeOf(web, local),
  };
}

/** Continue an existing trail, falling back to web research when needed. */
export async function buildHybridContinuation({
  supabase,
  userId,
  trail,
  question,
  onProgress,
}: {
  supabase: ServerSupabase;
  userId: string;
  trail: TrailApi;
  question: string;
  onProgress?: Progress;
}): Promise<HybridContinuationResult> {
  onProgress?.(SEARCHING);

  const deadline = new TrailDeadline();
  const existing = new Set(trail.steps.map((step) => step.chunkId));
  const lastStep = trail.steps.at(-1);
  // Anchor retrieval on where the trail currently ends so the continuation
  // stays connected to it, not only to the follow-up question.
  const retrievalQuery = lastStep
    ? `${question}\n\n${lastStep.note}\n\n${lastStep.excerpt}`
    : question;
  // Judge coverage on the follow-up question alone. The anchored query embeds
  // the last step's excerpt, which is itself a stored chunk, so its neighbours
  // always score as "covered" and the web fallback would never fire for a
  // follow-up the library knows nothing about.
  const [anchored, direct] = await Promise.all([
    findCandidates(supabase, retrievalQuery, MAX_CANDIDATES, existing),
    findCandidates(supabase, question, MAX_CANDIDATES, existing),
  ]);
  const covered = hasCoverage(direct);
  // When covered, keep the anchored matches first so the trail stays connected;
  // when not, only the question-relevant passages are worth blending with web.
  const local = covered
    ? dedupeCandidates([...anchored, ...direct]).slice(0, MAX_CANDIDATES)
    : direct.filter((candidate) => candidate.similarity >= LOCAL_BLEND_FLOOR);

  if (covered) {
    onProgress?.(WEAVING);

    return {
      continued: await continueTrail(trail, question, local, deadline),
      candidates: local,
      mode: "library",
    };
  }

  onProgress?.(WEB_FALLBACK);

  // Follow-ups are often elliptical ("what about its history?"), so give the
  // search engine the trail's topic as well.
  const webQuery = `${question} (context: ${trail.title})`.slice(0, 400);
  const web = await retrieveWeb(supabase, userId, webQuery, null);
  const candidates = combine(web, local).filter(
    (candidate) => !existing.has(candidate.chunkId),
  );

  if (candidates.length === 0) {
    throw new HybridTrailError(
      "No new passages were found to continue this trail. Try a different follow-up.",
      422,
    );
  }

  onProgress?.(WEAVING);

  return {
    continued: await continueTrail(trail, question, candidates, deadline),
    candidates,
    mode: modeOf(web, local),
  };
}
