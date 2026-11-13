import { NextResponse } from "next/server";

import { EmbeddingError, isEmbeddingConfigured } from "@/lib/ingestion/embeddings";
import type { PassageSearchResult } from "@/lib/links/types";
import { requireUser } from "@/lib/supabase/require-user";
import {
  embedQueries,
  makeExcerpt,
  matchCandidates,
  TrailError,
} from "@/lib/trails/server";

const RESULT_COUNT = 8;

/** Semantic search over your passages, e.g. to pick one to link to. ?q=... */
export async function GET(request: Request) {
  const auth = await requireUser("searching your library");

  if (auth.error) {
    return auth.error;
  }

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured, so passages can't be searched." },
      { status: 503 },
    );
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (query.length < 3 || query.length > 500) {
    return NextResponse.json(
      { error: "Search with 3 to 500 characters." },
      { status: 400 },
    );
  }

  try {
    const [embedding] = await embedQueries([query]);
    const matches = await matchCandidates(auth.supabase, embedding, RESULT_COUNT);
    const results: PassageSearchResult[] = matches.map((match) => ({
      chunkId: match.chunkId,
      documentTitle: match.documentTitle,
      page: match.page,
      excerpt: makeExcerpt(match.content),
      similarity: match.similarity,
      sourceOrigin: match.sourceOrigin ?? "library",
    }));

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof TrailError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof EmbeddingError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("[chunks/search]", error);
    return NextResponse.json({ error: "Search failed. Try again." }, { status: 500 });
  }
}
