/** Shared limits for the PDF ingestion pipeline. Safe to import on the client. */

export const PDF_MIME = "application/pdf";
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_MAX_LABEL = "25 MB";

/** Notes and pasted text are embedded directly, without a Storage upload. */
export const NOTE_MAX_BYTES = 1 * 1024 * 1024;
export const NOTE_MAX_LABEL = "1 MB";

/** Private Supabase Storage bucket that holds the raw PDFs. */
export const STORAGE_BUCKET = "documents";

/** Chunking window, measured in cl100k_base tokens. */
export const CHUNK_MIN_TOKENS = 500;
export const CHUNK_MAX_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 100;

/** How many chunks are sent to the embeddings API per request. */
export const EMBEDDING_BATCH_SIZE = 64;

/** How many chunk rows are written to Postgres per insert. */
export const INSERT_BATCH_SIZE = 100;
