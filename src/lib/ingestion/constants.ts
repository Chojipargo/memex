/** Shared limits for the document ingestion pipeline. Safe to import on the client. */

export const PDF_MIME = "application/pdf";
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_MAX_LABEL = "25 MB";

/** Images are OCR'd in the browser before the original is stored. */
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
] as const;

export const DOCUMENT_MIME_TYPES = [
  PDF_MIME,
  ...IMAGE_MIME_TYPES,
] as const;

export const DOCUMENT_ACCEPT = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
].join(",");

export const DOCUMENT_MAX_BYTES = PDF_MAX_BYTES;
export const DOCUMENT_MAX_LABEL = PDF_MAX_LABEL;

/** Client-extracted text is accepted up to 5 MB of UTF-8. */
export const DOCUMENT_TEXT_MAX_BYTES = 5 * 1024 * 1024;

/** Notes and pasted text are embedded directly, without a Storage upload. */
export const NOTE_MAX_BYTES = 1 * 1024 * 1024;
export const NOTE_MAX_LABEL = "1 MB";

/**
 * Characters of a note or document kept in the browser's workspace cache.
 * The full text lives in Supabase chunks; the cache only needs a readable
 * preview, and localStorage holds roughly 5 MB per origin in total.
 */
export const LOCAL_NOTE_BODY_MAX_CHARS = 20_000;

/** Fallback preview size when the browser's storage quota is exhausted. */
export const LOCAL_NOTE_BODY_COMPACT_CHARS = 2_000;

/** Private Supabase Storage bucket that holds the raw documents. */
export const STORAGE_BUCKET = "documents";

/** Chunking window, measured in cl100k_base tokens. */
export const CHUNK_MIN_TOKENS = 500;
export const CHUNK_MAX_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 100;

/** How many chunks are sent to the embeddings API per request. */
export const EMBEDDING_BATCH_SIZE = 64;

/** How many chunk rows are written to Postgres per insert. */
export const INSERT_BATCH_SIZE = 100;
