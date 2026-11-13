import "server-only";

import {
  type ExploreSort,
  parsePublishedSteps,
  parsePublishedSummary,
  type PublishedTrail,
  type PublishedTrailSummary,
} from "@/lib/explore/types";
import type { ServerSupabase } from "@/lib/trails/server";
import { TRAIL_UUID_PATTERN, TrailError, trailSetupHint } from "@/lib/trails/server";

const SUMMARY_COLUMNS =
  "id, title, question, step_count, origin, learner_count, published_at, updated_at";

export const EXPLORE_PAGE_SIZE = 30;

/** Published trails, most-learned first (or newest first). Readable signed out. */
export async function listPublishedTrails(
  supabase: ServerSupabase,
  sort: ExploreSort,
  limit = EXPLORE_PAGE_SIZE,
): Promise<PublishedTrailSummary[]> {
  let query = supabase.from("published_trails").select(SUMMARY_COLUMNS);

  query =
    sort === "recent"
      ? query.order("published_at", { ascending: false })
      : query
          .order("learner_count", { ascending: false })
          .order("published_at", { ascending: false });

  const result = await query.limit(limit);

  if (result.error) {
    throw new TrailError(
      trailSetupHint(result.error.message, "exploring public trails") ??
        "Could not load public trails.",
      503,
    );
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .map(parsePublishedSummary)
    .filter((trail): trail is PublishedTrailSummary => trail !== null);
}

/** One published trail with its step snapshot, or null when it doesn't exist. */
export async function loadPublishedTrail(
  supabase: ServerSupabase,
  id: string,
): Promise<PublishedTrail | null> {
  if (!TRAIL_UUID_PATTERN.test(id)) {
    return null;
  }

  const result = await supabase
    .from("published_trails")
    .select(`${SUMMARY_COLUMNS}, steps`)
    .eq("id", id)
    .maybeSingle();

  if (result.error) {
    throw new TrailError(
      trailSetupHint(result.error.message, "exploring public trails") ??
        "Could not load this public trail.",
      503,
    );
  }

  if (!result.data) {
    return null;
  }

  const summary = parsePublishedSummary(result.data);
  const steps = parsePublishedSteps((result.data as { steps?: unknown }).steps);

  if (!summary || !steps) {
    throw new TrailError("The trail service returned an unexpected response.", 502);
  }

  return { ...summary, steps };
}
