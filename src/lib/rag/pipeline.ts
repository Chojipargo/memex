import "server-only";

import { saveWebSources } from "@/lib/rag/ingest";
import type { TrailProgress } from "@/lib/rag/types";
import { extractUrl, isWebSearchConfigured, searchWeb } from "@/lib/rag/web";
import type { TrailApi } from "@/lib/trails/api";
import {
  continueTrail,
  type ContinuedTrail,
  type GeneratedTrail,
  generateTrail,
  TRAIL_COVERAGE_THRESHOLD,
} from "@/lib/trails/generate";
import {
  embedQueries,
  hasCoverage,
  type MatchedChunk,
  matchCandidates,
  type ServerSupabase,
} from "@/lib/trails/server";
import { TrailDeadline } from "@/lib/trails/timeouts";

export type HybridTrailMode = "library" | "web" | "hybrid";

export class HybridTrailError extends Error {
  readonly status: number;
  /**
   * True only when the library lacks coverage and adding a source (or
   * researching the web) is the fix, so the UI can offer those actions.
   */
  readonly lowCoverage: boolean;

  constructor(message: string, status = 502, lowCoverage = false) {
    super(message);
    this.name = "HybridTrailError";
    this.status = status;
    this.lowCoverage = lowCoverage;
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

/** Upper bound on web research (search or extract, fetches, embedding). */
const WEB_RESEARCH_BUDGET_MS = 20_000;

/** Time kept back from research so Claude can still write the trail. */
const GENERATION_RESERVE_MS = 18_000;

/**
 * Library passages only join a web-backed trail when they clear the same
 * relevance bar that decides coverage. Passages that just failed that check
 * would otherwise pad the trail and mislabel it "Hybrid".
 */
function relevantLocal(local: ReadonlyArray<MatchedChunk>): MatchedChunk[] {
  return local.filter(
    (candidate) => candidate.similarity >= TRAIL_COVERAGE_THRESHOLD,
  );
}

/**
 * Merge web and library passages and rank them together by their real
 * similarity to the question.
 */
function combine(
  web: ReadonlyArray<MatchedChunk>,
  local: ReadonlyArray<MatchedChunk>,
): MatchedChunk[] {
  const byChunk = new Map<number, MatchedChunk>();

  for (const candidate of [...web, ...local]) {
    const existing = byChunk.get(candidate.chunkId);

    if (!existing || candidate.similarity > existing.similarity) {
      byChunk.set(candidate.chunkId, candidate);
    }
  }

  return [...byChunk.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CANDIDATES);
}

function modeOf(candidates: ReadonlyArray<MatchedChunk>): HybridTrailMode {
  const hasWeb = candidates.some((candidate) => candidate.sourceOrigin === "web");
  const hasLibrary = candidates.some(
    (candidate) => candidate.sourceOrigin !== "web",
  );

  if (hasWeb && hasLibrary) {
    return "hybrid";
  }

  return hasWeb ? "web" : "library";
}

/** A research budget carved out of the route deadline, leaving room to generate. */
function researchDeadline(deadline: TrailDeadline): TrailDeadline {
  const available = Math.min(
    WEB_RESEARCH_BUDGET_MS,
    deadline.remainingMs() - GENERATION_RESERVE_MS,
  );

  if (available < 3_000) {
    throw new HybridTrailError(
      "There wasn't enough time left to research the web. Try again in a moment.",
      504,
    );
  }

  return new TrailDeadline(available);
}

async function retrieveWeb({
  supabase,
  userId,
  searchQuery,
  url,
  queryEmbedding,
  deadline,
  automatic,
}: {
  supabase: ServerSupabase;
  userId: string;
  searchQuery: string;
  url: string | null | undefined;
  queryEmbedding: number[];
  deadline: TrailDeadline;
  automatic: boolean;
}): Promise<MatchedChunk[]> {
  if (automatic && !url && !isWebSearchConfigured()) {
    throw new HybridTrailError(
      "Your library doesn't cover this yet, and web research isn't set up (add TAVILY_API_KEY to enable it).",
      422,
      true,
    );
  }

  const research = researchDeadline(deadline);
  const sources = url
    ? [await extractUrl(url, research)]
    : await searchWeb(searchQuery, research, 6);

  if (sources.length === 0) {
    throw new HybridTrailError(
      "I couldn't find reliable external sources for that topic. Try a more specific question or paste a URL.",
      422,
    );
  }

  const saved = await saveWebSources(
    supabase,
    userId,
    sources,
    queryEmbedding,
    research,
  );

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
 * and still blends in personal passages that are genuinely relevant.
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
  const [queryEmbedding] = await embedQueries([question]);
  const local = await matchCandidates(supabase, queryEmbedding, MAX_CANDIDATES);

  if (mode === "auto" && hasCoverage(local)) {
    onProgress?.(WEAVING);

    return {
      generated: await generateTrail(question, local, deadline),
      candidates: local,
      mode: "library",
    };
  }

  onProgress?.(mode === "research" ? WEB_MANUAL : WEB_FALLBACK);

  const web = await retrieveWeb({
    supabase,
    userId,
    searchQuery: question,
    url,
    queryEmbedding,
    deadline,
    automatic: mode === "auto",
  });
  const candidates = combine(web, relevantLocal(local));

  onProgress?.(WEAVING);

  return {
    generated: await generateTrail(question, candidates, deadline),
    candidates,
    mode: modeOf(candidates),
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
  const anchoredQuery = lastStep
    ? `${question}\n\n${lastStep.note}\n\n${lastStep.excerpt}`
    : question;
  const [anchoredEmbedding, directEmbedding] = await embedQueries([
    anchoredQuery,
    question,
  ]);
  // Judge coverage on the follow-up question alone. The anchored query embeds
  // the last step's excerpt, which is itself a stored chunk, so its neighbours
  // always score as "covered" and the web fallback would never fire for a
  // follow-up the library knows nothing about.
  const [anchored, direct] = await Promise.all([
    matchCandidates(supabase, anchoredEmbedding, MAX_CANDIDATES, existing),
    matchCandidates(supabase, directEmbedding, MAX_CANDIDATES, existing),
  ]);

  if (hasCoverage(direct)) {
    // Keep the anchored matches first so the trail stays connected.
    const byChunk = new Map<number, MatchedChunk>();

    for (const candidate of [...anchored, ...direct]) {
      if (!byChunk.has(candidate.chunkId)) {
        byChunk.set(candidate.chunkId, candidate);
      }
    }

    const local = [...byChunk.values()].slice(0, MAX_CANDIDATES);

    onProgress?.(WEAVING);

    return {
      continued: await continueTrail(trail, question, local, deadline),
      candidates: local,
      mode: "library",
    };
  }

  onProgress?.(WEB_FALLBACK);

  // Follow-ups are often elliptical ("what about its history?"), so give the
  // search engine the trail's topic as well. Passages are still scored
  // against the follow-up itself.
  const web = await retrieveWeb({
    supabase,
    userId,
    searchQuery: `${question} (context: ${trail.title})`.slice(0, 400),
    url: null,
    queryEmbedding: directEmbedding,
    deadline,
    automatic: true,
  });
  const candidates = combine(web, relevantLocal(direct)).filter(
    (candidate) => !existing.has(candidate.chunkId),
  );

  if (candidates.length === 0) {
    throw new HybridTrailError(
      "No new passages were found to continue this trail. Try a different follow-up, or add a source about it.",
      422,
      true,
    );
  }

  onProgress?.(WEAVING);

  return {
    continued: await continueTrail(trail, question, candidates, deadline),
    candidates,
    mode: modeOf(candidates),
  };
}
