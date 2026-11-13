import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChunkContext, ChunkNeighbor } from "@/lib/trails/context";
import { findOverlap, trimOverlap } from "@/lib/trails/quote";
import { trailSetupHint } from "@/lib/trails/server";

type NeighborRow = ChunkNeighbor & {
  relation: "previous" | "current" | "next";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === "string" && /^\d{1,15}$/.test(value)) {
    const parsed = Number(value);
    return parsed >= 1 ? parsed : null;
  }

  return null;
}

function parseRows(value: unknown): NeighborRow[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rows: NeighborRow[] = [];

  for (const raw of value) {
    const row = asRecord(raw);
    const chunkId = asPositiveInteger(row?.chunk_id);
    const page = asPositiveInteger(row?.page);
    const content = row?.content;
    const relation = row?.relation;

    if (
      chunkId === null ||
      page === null ||
      typeof content !== "string" ||
      (relation !== "previous" && relation !== "current" && relation !== "next")
    ) {
      return null;
    }

    rows.push({ chunkId, page, content, relation });
  }

  return rows;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add the URL and anon key to .env.local.",
      },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in before reading a passage." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const chunkId = asPositiveInteger(id);

  if (chunkId === null) {
    return NextResponse.json({ error: "Passage not found." }, { status: 404 });
  }

  try {
    const result = await supabase.rpc("get_chunk_neighbors", {
      p_chunk_id: chunkId,
    });

    if (result.error) {
      return NextResponse.json(
        {
          error:
            trailSetupHint(result.error.message, "reading passages") ??
            "Could not load this passage.",
        },
        { status: 503 },
      );
    }

    const rows = parseRows(result.data);

    if (!rows) {
      return NextResponse.json(
        { error: "The passage service returned an unexpected response." },
        { status: 502 },
      );
    }

    const pick = (relation: NeighborRow["relation"]): ChunkNeighbor | null => {
      const row = rows.find((item) => item.relation === relation);
      return row
        ? { chunkId: row.chunkId, page: row.page, content: row.content }
        : null;
    };

    // The RPC only returns rows for the caller's own documents, so a missing
    // "current" row means not found or not theirs.
    const current = pick("current");

    if (!current) {
      return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    }

    const previous = pick("previous");
    const next = pick("next");

    // Chunks overlap by ~100 tokens. Remove the repeated text at each seam
    // from the neighbours, never from the current chunk, so the current
    // passage stays whole and quote offsets into it remain valid.
    const previousOverlap = previous
      ? findOverlap(previous.content, current.content)
      : null;

    const body: ChunkContext = {
      previous: previous
        ? {
            ...previous,
            content: previousOverlap
              ? previous.content.slice(0, previousOverlap.previousEnd).trimEnd()
              : previous.content,
          }
        : null,
      current,
      next: next
        ? { ...next, content: trimOverlap(current.content, next.content) }
        : null,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("[chunks/:id/context]", error);

    return NextResponse.json(
      { error: "Something went wrong while loading this passage. Try again." },
      { status: 500 },
    );
  }
}
