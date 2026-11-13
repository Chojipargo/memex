import { NextResponse } from "next/server";

import { parseAssociationGraph } from "@/lib/graph/types";
import { requireUser } from "@/lib/supabase/require-user";
import { trailSetupHint } from "@/lib/trails/server";

const DEFAULT_NODE_LIMIT = 30;

/** Days for an unused link or trail to lose half its strength on the map. */
function readHalfLife(value: string | undefined): number {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : 30;
}

const HALF_LIFE_DAYS = readHalfLife(process.env.ASSOCIATION_HALF_LIFE_DAYS);

/** The reader's usage-weighted association map. ?limit= caps the passages (2-100). */
export async function GET(request: Request) {
  const auth = await requireUser("loading your association map");

  if (auth.error) {
    return auth.error;
  }

  const rawLimit = Number(new URL(request.url).searchParams.get("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 2 && rawLimit <= 100 ? rawLimit : DEFAULT_NODE_LIMIT;

  const result = await auth.supabase.rpc("get_association_graph", {
    p_node_limit: limit,
    p_half_life_days: HALF_LIFE_DAYS,
  });

  if (result.error) {
    return NextResponse.json(
      {
        error:
          trailSetupHint(result.error.message, "loading the association map") ??
          "Could not load your association map.",
      },
      { status: 503 },
    );
  }

  const graph = parseAssociationGraph(result.data);

  if (!graph) {
    return NextResponse.json(
      { error: "The map service returned an unexpected response." },
      { status: 502 },
    );
  }

  return NextResponse.json(graph);
}
