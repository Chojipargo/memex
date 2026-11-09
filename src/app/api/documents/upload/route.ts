import { NextResponse } from "next/server";

import { chunkPages, type SourcePage } from "@/lib/ingestion/chunk";
import {
  EMBEDDING_BATCH_SIZE,
  INSERT_BATCH_SIZE,
  PDF_MAX_BYTES,
  PDF_MIME,
  STORAGE_BUCKET,
} from "@/lib/ingestion/constants";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingError,
  embedTexts,
  isEmbeddingConfigured,
} from "@/lib/ingestion/embeddings";
import { extractPdfPages } from "@/lib/ingestion/pdf";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

class IngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof IngestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EmbeddingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[documents/upload]", error);

  return NextResponse.json(
    { error: "Something went wrong while processing this PDF. Try again." },
    { status: 500 },
  );
}

function cleanTitle(value: FormDataEntryValue | null, fileName: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.replace(/\s+/g, " ").trim().slice(0, 200);
  }

  const fromFileName = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 200);

  return fromFileName || "Untitled document";
}

function setupHint(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.includes("bucket not found")) {
    return "The private PDF bucket is missing. Apply the Supabase migration before uploading.";
  }

  if (
    (lower.includes("relation") && lower.includes("does not exist")) ||
    lower.includes("could not find the table") ||
    lower.includes("schema cache")
  ) {
    return "The documents and chunks tables are missing. Apply the Supabase migration before uploading.";
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "The database rejected the write. Check the RLS policies from the Supabase migration.";
  }

  return null;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured. Add the URL and anon key to .env.local." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in before uploading a document." },
      { status: 401 },
    );
  }

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured. Add it to .env.local to generate embeddings.",
      },
      { status: 503 },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read the upload. Use multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Attach a PDF in the `file` field." },
      { status: 400 },
    );
  }

  const fileName = file.name.replace(/^.*[\\/]/, "");
  const looksLikePdf =
    file.type === PDF_MIME || fileName.toLowerCase().endsWith(".pdf");

  if (!looksLikePdf) {
    return NextResponse.json(
      { error: "Only PDF files are supported." },
      { status: 415 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The PDF is empty." }, { status: 400 });
  }

  if (file.size > PDF_MAX_BYTES) {
    return NextResponse.json(
      { error: "This PDF is larger than the 25 MB limit." },
      { status: 413 },
    );
  }

  let bytes: Uint8Array;

  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded file." },
      { status: 400 },
    );
  }

  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));

  if (!header.includes("%PDF-")) {
    return NextResponse.json(
      { error: "This file does not look like a valid PDF." },
      { status: 415 },
    );
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${documentId}.pdf`;
  const title = cleanTitle(formData.get("title"), fileName);
  let uploaded = false;
  let created = false;

  try {
    // Step 1: store the raw PDF.
    // Supabase derives the multipart MIME type from the Blob, so normalize it
    // when a browser reports an empty or unusual type for a `.pdf` file.
    const uploadBody =
      file.type === PDF_MIME
        ? file
        : new File([file], fileName, { type: PDF_MIME });

    const upload = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, uploadBody, {
        contentType: PDF_MIME,
        cacheControl: "0",
        upsert: false,
      });

    if (upload.error) {
      throw new IngestError(
        setupHint(upload.error.message) ?? "Could not store the PDF. Try again.",
        503,
      );
    }

    uploaded = true;

    // Step 1 (continued): create the document record.
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
      throw new IngestError(
        setupHint(insert.error.message) ?? "Could not create the document record.",
        503,
      );
    }

    created = true;

    // Step 2: extract text page by page.
    let pages: SourcePage[];

    try {
      pages = await extractPdfPages(bytes);
    } catch (error) {
      console.error("[documents/upload] PDF extraction failed", error);
      throw new IngestError(
        "Could not read this PDF. It may be encrypted, password-protected or corrupted.",
        422,
      );
    }

    const textPages = pages.filter((page) => page.text.length > 0);

    if (textPages.length === 0) {
      throw new IngestError(
        "No selectable text was found. Scanned PDFs need OCR before uploading.",
        422,
      );
    }

    // Step 3: chunk with sentence-aware boundaries and a 100-token overlap.
    const chunks = chunkPages(textPages);

    if (chunks.length === 0) {
      throw new IngestError("The PDF did not produce any text chunks.", 422);
    }

    // Step 4: embed in batches of 64.
    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));

    if (vectors.length !== chunks.length) {
      throw new EmbeddingError(
        "The embedding provider returned the wrong number of vectors.",
      );
    }

    // Step 5: insert chunks, embedding first, in batches of 100.
    const rows = chunks.map((chunk, index) => ({
      document_id: documentId,
      page: chunk.page,
      text: chunk.text,
      embedding: JSON.stringify(vectors[index]),
    }));

    for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
      const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
      const result = await supabase.from("chunks").insert(batch);

      if (result.error) {
        throw new IngestError(
          setupHint(result.error.message) ?? "Could not store the document chunks.",
          503,
        );
      }
    }

    return NextResponse.json(
      {
        document: {
          documentId,
          title,
          pages: pages.length,
          textPages: textPages.length,
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
    // Roll back the document and the stored PDF so a retry starts clean.
    if (created) {
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("document_id", documentId);

      if (deleteError) {
        console.error("[documents/upload] document rollback failed", deleteError);
      }
    }

    if (uploaded) {
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath]);

      if (removeError) {
        console.error("[documents/upload] storage rollback failed", removeError);
      }
    }

    return errorResponse(error);
  }
}
