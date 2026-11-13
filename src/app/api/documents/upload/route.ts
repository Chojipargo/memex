import { NextResponse } from "next/server";

import { chunkPages, type SourcePage } from "@/lib/ingestion/chunk";
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MAX_LABEL,
  DOCUMENT_TEXT_MAX_BYTES,
  EMBEDDING_BATCH_SIZE,
  INSERT_BATCH_SIZE,
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
import { splitExtractedPages } from "@/lib/documents/pages";
import type {
  ExtractionMethod,
  ExtractionPage,
} from "@/lib/documents/types";
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

type DocumentFormat = {
  mime: string;
  extension: string;
  kind: "pdf" | "image";
};

const IMAGE_FORMATS: Record<
  string,
  { mime: string; extension: string }
> = {
  "image/png": { mime: "image/png", extension: "png" },
  "image/jpeg": { mime: "image/jpeg", extension: "jpg" },
  "image/jpg": { mime: "image/jpeg", extension: "jpg" },
  "image/webp": { mime: "image/webp", extension: "webp" },
  "image/bmp": { mime: "image/bmp", extension: "bmp" },
  "image/x-ms-bmp": { mime: "image/bmp", extension: "bmp" },
};

function errorResponse(error: unknown) {
  if (error instanceof IngestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof EmbeddingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[documents/upload]", error);

  return NextResponse.json(
    { error: "Something went wrong while processing this document. Try again." },
    { status: 500 },
  );
}

function cleanTitle(value: FormDataEntryValue | null, fileName: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.replace(/\s+/g, " ").trim().slice(0, 200);
  }

  const fromFileName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 200);

  return fromFileName || "Untitled document";
}

function resolveDocumentFormat(
  fileName: string,
  mimeType: string,
): DocumentFormat | null {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  if (lowerMime === PDF_MIME || lowerName.endsWith(".pdf")) {
    return { mime: PDF_MIME, extension: "pdf", kind: "pdf" };
  }

  if (IMAGE_FORMATS[lowerMime]) {
    return { ...IMAGE_FORMATS[lowerMime], kind: "image" };
  }

  if (lowerName.endsWith(".png")) {
    return { mime: "image/png", extension: "png", kind: "image" };
  }

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return { mime: "image/jpeg", extension: "jpg", kind: "image" };
  }

  if (lowerName.endsWith(".webp")) {
    return { mime: "image/webp", extension: "webp", kind: "image" };
  }

  if (lowerName.endsWith(".bmp")) {
    return { mime: "image/bmp", extension: "bmp", kind: "image" };
  }

  return null;
}

function hasExpectedHeader(bytes: Uint8Array, format: DocumentFormat) {
  if (format.kind === "pdf") {
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
    return header.includes("%PDF-");
  }

  if (format.mime === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (format.mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (format.mime === "image/webp") {
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 12));
    return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  }

  if (format.mime === "image/bmp") {
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 2));
    return header === "BM";
  }

  return false;
}

function setupHint(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.includes("bucket not found")) {
    return "The private documents bucket is missing. Apply the Supabase migration before uploading.";
  }

  if (
    lower.includes("mime") &&
    (lower.includes("invalid") || lower.includes("not allowed") || lower.includes("type"))
  ) {
    return "The documents bucket only accepts PDFs. Apply the latest Supabase migration to enable image uploads.";
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

function isMissingMetadataColumn(message: string) {
  const lower = message.toLowerCase();
  const metadataColumns = [
    "mime_type",
    "page_count",
    "extracted_text",
    "extraction_method",
    "ocr_pages",
  ];

  return (
    metadataColumns.some((column) => lower.includes(column)) &&
    // Only "column does not exist" / PostgREST "could not find the column",
    // not any error that happens to mention a column (e.g. a NOT NULL failure).
    ((lower.includes("column") && lower.includes("does not exist")) ||
      (lower.includes("could not find") && lower.includes("schema cache")))
  );
}

function parsePageTexts(value: FormDataEntryValue | null): ExtractionPage[] | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    const pages: ExtractionPage[] = [];

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as { page?: unknown; text?: unknown };
      const page = Number(record.page);
      const text = typeof record.text === "string" ? record.text : "";

      if (!Number.isFinite(page) || page < 1 || !text.trim()) {
        continue;
      }

      pages.push({
        page: Math.floor(page),
        text: text.replace(/\u0000/g, "").trim(),
        method: "ocr",
      });
    }

    pages.sort((left, right) => left.page - right.page);

    return pages.length > 0 ? pages : null;
  } catch {
    return null;
  }
}

function readExtractionMethod(value: FormDataEntryValue | null): ExtractionMethod | null {
  return value === "ocr" || value === "text-layer" || value === "mixed"
    ? value
    : null;
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
          "GEMINI_API_KEY is not configured. Add it to .env.local to generate embeddings.",
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
      { error: "Attach a document in the `file` field." },
      { status: 400 },
    );
  }

  const fileName = file.name.replace(/^.*[\\/]/, "") || "document";
  const format = resolveDocumentFormat(fileName, file.type);

  if (!format) {
    return NextResponse.json(
      { error: "Only PDF, PNG, JPEG, WebP, and BMP files are supported." },
      { status: 415 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The document is empty." }, { status: 400 });
  }

  if (file.size > DOCUMENT_MAX_BYTES) {
    return NextResponse.json(
      { error: `This document is larger than ${DOCUMENT_MAX_LABEL}.` },
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

  if (!hasExpectedHeader(bytes, format)) {
    return NextResponse.json(
      {
        error:
          format.kind === "pdf"
            ? "This file does not look like a valid PDF."
            : "This file does not look like a valid image.",
      },
      { status: 415 },
    );
  }

  let extractedText =
    typeof formData.get("extractedText") === "string"
      ? (formData.get("extractedText") as string).trim()
      : "";

  if (Buffer.byteLength(extractedText, "utf8") > DOCUMENT_TEXT_MAX_BYTES) {
    return NextResponse.json(
      { error: "The extracted text is larger than the 5 MB limit." },
      { status: 413 },
    );
  }

  const pageTextsRaw = formData.get("pageTexts");

  if (
    typeof pageTextsRaw === "string" &&
    Buffer.byteLength(pageTextsRaw, "utf8") > DOCUMENT_TEXT_MAX_BYTES * 2
  ) {
    return NextResponse.json(
      { error: "The extracted page text is larger than the 5 MB limit." },
      { status: 413 },
    );
  }

  let pages = parsePageTexts(pageTextsRaw) ?? [];

  if (extractedText && pages.length === 0) {
    pages = splitExtractedPages(extractedText);
  }

  if (!extractedText && pages.length > 0) {
    extractedText = pages.map((page) => page.text).join("\n\n");
  }

  let usedServerPdfExtraction = false;

  if (!extractedText) {
    if (format.kind !== "pdf") {
      return NextResponse.json(
        {
          error:
            "No text was extracted from this image. Try a clearer scan or enter the text manually.",
        },
        { status: 422 },
      );
    }

    try {
      const serverPages = await extractPdfPages(bytes);
      pages = serverPages
        .filter((page) => page.text.length > 0)
        .map((page) => ({
          page: page.page,
          text: page.text,
          method: "text-layer" as const,
        }));
      extractedText = pages.map((page) => page.text).join("\n\n");
      usedServerPdfExtraction = true;
    } catch (error) {
      console.error("[documents/upload] PDF extraction failed", error);
      return NextResponse.json(
        {
          error:
            "Could not read this PDF. It may be encrypted, password-protected or corrupted.",
        },
        { status: 422 },
      );
    }

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            "No selectable text was found. Scanned PDFs should be uploaded through the OCR document flow.",
        },
        { status: 422 },
      );
    }
  }

  if (Buffer.byteLength(extractedText, "utf8") > DOCUMENT_TEXT_MAX_BYTES) {
    return NextResponse.json(
      { error: "The extracted text is larger than the 5 MB limit." },
      { status: 413 },
    );
  }

  const textPages = pages.filter((page) => page.text.length > 0);

  if (textPages.length === 0) {
    return NextResponse.json(
      { error: "The document did not produce any readable text." },
      { status: 422 },
    );
  }

  const parsedPageCount = Number(formData.get("pageCount"));
  const maxPage = textPages.reduce(
    (current, page) => Math.max(current, page.page),
    0,
  );
  const pageCount = Math.min(
    10_000,
    Math.max(
      Number.isFinite(parsedPageCount) ? Math.floor(parsedPageCount) : 0,
      maxPage,
      textPages.length,
      1,
    ),
  );
  const extractionMethod =
    readExtractionMethod(formData.get("extractionMethod")) ??
    (usedServerPdfExtraction ? "text-layer" : "ocr");
  const trailIdRaw = formData.get("trailId");
  const trailId =
    typeof trailIdRaw === "string" ? trailIdRaw.trim().slice(0, 200) : "";

  const chunks = chunkPages(textPages as SourcePage[]);

  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "The document did not produce any text chunks." },
      { status: 422 },
    );
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${documentId}.${format.extension}`;
  const title = cleanTitle(formData.get("title"), fileName);
  let uploaded = false;
  let created = false;

  try {
    // Step 1: store the raw document. Normalize the MIME type because browsers
    // sometimes report an empty or legacy type for valid files.
    const uploadBody =
      file.type === format.mime
        ? file
        : new File([file], fileName, { type: format.mime });

    const upload = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, uploadBody, {
        contentType: format.mime,
        cacheControl: "0",
        upsert: false,
      });

    if (upload.error) {
      throw new IngestError(
        setupHint(upload.error.message) ??
          "Could not store the document. Try again.",
        503,
      );
    }

    uploaded = true;

    // Step 1 (continued): create the document record with OCR metadata.
    const metadataInsert = {
      document_id: documentId,
      title,
      storage_path: storagePath,
      mime_type: format.mime,
      page_count: pageCount,
      extracted_text: extractedText,
      extraction_method: extractionMethod,
      ocr_pages: pages,
    };

    let insert = await supabase
      .from("documents")
      .insert(metadataInsert)
      .select("document_id")
      .single();

    if (insert.error && isMissingMetadataColumn(insert.error.message)) {
      console.warn(
        "[documents/upload] OCR metadata columns are missing; apply the latest migration.",
        insert.error.message,
      );

      insert = await supabase
        .from("documents")
        .insert({
          document_id: documentId,
          title,
          storage_path: storagePath,
        })
        .select("document_id")
        .single();
    }

    if (insert.error) {
      throw new IngestError(
        setupHint(insert.error.message) ?? "Could not create the document record.",
        503,
      );
    }

    created = true;

    // Step 2: embed in batches of 64.
    const vectors = await embedTexts(chunks.map((chunk) => chunk.text));

    if (vectors.length !== chunks.length) {
      throw new EmbeddingError(
        "The embedding provider returned the wrong number of vectors.",
      );
    }

    // Step 3: insert chunks, embedding first, in batches of 100.
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
          setupHint(result.error.message) ??
            "Could not store the document chunks.",
          503,
        );
      }
    }

    // Step 4: link the document to the current trail. The app keeps its local
    // trail immediately; this mirrors the ordered node in Postgres so the same
    // sequence survives across devices.
    let trailLinked = false;

    if (trailId) {
      const { error: linkError } = await supabase.rpc(
        "append_document_to_trail",
        {
          p_trail_id: trailId,
          p_document_id: documentId,
          p_relation:
            extractionMethod === "ocr" ? "OCR source" : "Document source",
        },
      );

      if (linkError) {
        console.error("[documents/upload] trail link failed", linkError);
      } else {
        trailLinked = true;
      }
    }

    return NextResponse.json(
      {
        document: {
          documentId,
          title,
          pages: pageCount,
          textPages: textPages.length,
          chunks: chunks.length,
          tokens: chunks.reduce((total, chunk) => total + chunk.tokens, 0),
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          batchSize: EMBEDDING_BATCH_SIZE,
          extractionMethod,
          trailLinked,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    // Roll back the document and stored file so a retry starts clean.
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
