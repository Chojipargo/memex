import { NextResponse } from "next/server";

import { chunkPages } from "@/lib/ingestion/chunk";
import {
  EMBEDDING_BATCH_SIZE,
  INSERT_BATCH_SIZE,
  NOTE_MAX_BYTES,
  NOTE_MAX_LABEL,
} from "@/lib/ingestion/constants";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingError,
  embedTexts,
  isEmbeddingConfigured,
} from "@/lib/ingestion/embeddings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

class NoteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "NoteError";
    this.status = status;
  }
}

type NoteBody = {
  title?: unknown;
  content?: unknown;
};

function setupHint(message: string): string | null {
  const lower = message.toLowerCase();

  if (
    (lower.includes("relation") && lower.includes("does not exist")) ||
    lower.includes("could not find the table") ||
    lower.includes("schema cache")
  ) {
    return "The documents and chunks tables are missing. Apply the Supabase migration before saving notes.";
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "The database rejected the write. Check the RLS policies from the Supabase migration.";
  }

  return null;
}

function cleanTitle(value: unknown, content: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.replace(/\s+/g, " ").trim().slice(0, 200);
  }

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return (firstLine?.replace(/\s+/g, " ").slice(0, 200) || "Untitled note");
}

function errorResponse(error: unknown) {
  if (error instanceof NoteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EmbeddingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[documents/note]", error);

  return NextResponse.json(
    { error: "Something went wrong while saving this note. Try again." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
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
      { error: "You need to sign in before saving a note." },
      { status: 401 },
    );
  }

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not configured. Add it to .env.local to generate embeddings.",
      },
      { status: 503 },
    );
  }

  let payload: NoteBody;

  try {
    payload = (await request.json()) as NoteBody;
  } catch {
    return NextResponse.json(
      { error: "Send the note as JSON with `title` and `content`." },
      { status: 400 },
    );
  }

  const content =
    typeof payload.content === "string" ? payload.content.trim() : "";

  if (!content) {
    return NextResponse.json(
      { error: "Write something before saving this note." },
      { status: 400 },
    );
  }

  if (Buffer.byteLength(content, "utf8") > NOTE_MAX_BYTES) {
    return NextResponse.json(
      { error: `Notes are limited to ${NOTE_MAX_LABEL}.` },
      { status: 413 },
    );
  }

  const title = cleanTitle(payload.title, content);
  const documentId = crypto.randomUUID();
  const storagePath = `notes/${user.id}/${documentId}.md`;
  let created = false;

  try {
    const insert = await supabase
      .from("documents")
      .insert({
        document_id: documentId,
        title,
        storage_path: storagePath,
      })
      .select("document_id")
      .single();

    if (insert.error) {
      throw new NoteError(
        setupHint(insert.error.message) ?? "Could not create the note record.",
        503,
      );
    }

    created = true;

    const chunks = chunkPages([{ page: 1, text: content }]);

    if (chunks.length === 0) {
      throw new NoteError("The note did not produce any text chunks.", 422);
    }

    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));

    if (vectors.length !== chunks.length) {
      throw new EmbeddingError(
        "The embedding provider returned the wrong number of vectors.",
      );
    }

    const rows = chunks.map((chunk, index) => ({
      document_id: documentId,
      page: chunk.page,
      text: chunk.text,
      embedding: JSON.stringify(vectors[index]),
    }));

    for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
      const result = await supabase
        .from("chunks")
        .insert(rows.slice(start, start + INSERT_BATCH_SIZE));

      if (result.error) {
        throw new NoteError(
          setupHint(result.error.message) ?? "Could not store the note chunks.",
          503,
        );
      }
    }

    return NextResponse.json(
      {
        document: {
          documentId,
          title,
          pages: 1,
          textPages: 1,
          chunks: chunks.length,
          tokens: chunks.reduce((total, chunk) => total + chunk.tokens, 0),
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          batchSize: EMBEDDING_BATCH_SIZE,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (created) {
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("document_id", documentId);

      if (deleteError) {
        console.error("[documents/note] rollback failed", deleteError);
      }
    }

    return errorResponse(error);
  }
}
