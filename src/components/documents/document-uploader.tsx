"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

import { OcrReviewDialog } from "@/components/documents/ocr-review-dialog";
import {
  AlertIcon,
  CheckIcon,
  FileTextIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import {
  extractDocument,
  isSupportedDocument,
  type ExtractionProgress,
} from "@/lib/documents/extract";
import {
  displayExtractedText,
  splitExtractedPages,
} from "@/lib/documents/pages";
import type {
  DocumentCreated,
  ExtractionMethod,
  IngestedDocument,
} from "@/lib/documents/types";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MAX_LABEL,
  LOCAL_NOTE_BODY_MAX_CHARS,
} from "@/lib/ingestion/constants";

type OcrDraft = {
  file: File;
  previewUrl: string | null;
  pageCount: number;
  method: ExtractionMethod;
  mimeType: string;
  fileKind: "pdf" | "image";
  text: string;
};

type UploadState =
  | { status: "idle" }
  | { status: "extracting"; progress: ExtractionProgress }
  | {
      status: "review";
      draft: OcrDraft;
      busy: boolean;
      progress: number;
      error: string | null;
    }
  | { status: "success"; document: IngestedDocument }
  | { status: "error"; message: string };

type ApiResponse = {
  document?: IngestedDocument;
  error?: string;
};

function titleFromFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function friendlyMethod(method: ExtractionMethod) {
  if (method === "ocr") return "OCR";
  if (method === "text-layer") return "PDF text layer";
  return "Text layer + OCR";
}

export function DocumentUploader({
  targetTrailId,
  onDocumentCreated,
}: {
  targetTrailId?: string | null;
  onDocumentCreated: (document: DocumentCreated) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const extractionRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ status: "idle" });

  const busy =
    state.status === "extracting" ||
    (state.status === "review" && state.busy);
  const reviewing = state.status === "review";

  useEffect(() => {
    return () => {
      extractionRef.current?.abort();
      requestRef.current?.abort();

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const releasePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const reset = () => {
    extractionRef.current?.abort();
    extractionRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    releasePreview();
    setState({ status: "idle" });
    setTitle("");
  };

  const fail = (message: string) => {
    releasePreview();
    setState({ status: "error", message });
  };

  const reviewError = (message: string) => {
    setState((current) =>
      current.status === "review"
        ? { ...current, busy: false, progress: 0, error: message }
        : { status: "error", message },
    );
  };

  const beginExtraction = async (file: File) => {
    if (busy || reviewing) {
      return;
    }

    if (!isSupportedDocument(file)) {
      fail("Choose a PDF, PNG, JPEG, WebP, or BMP file.");
      return;
    }

    if (file.size === 0) {
      fail("That file is empty.");
      return;
    }

    if (file.size > DOCUMENT_MAX_BYTES) {
      fail(`This document is larger than ${DOCUMENT_MAX_LABEL}.`);
      return;
    }

    releasePreview();

    if (!title.trim()) {
      setTitle(titleFromFileName(file.name));
    }

    const controller = new AbortController();
    extractionRef.current = controller;
    setState({
      status: "extracting",
      progress: {
        label: "Preparing document",
        progress: 0,
        page: 0,
        pages: 0,
      },
    });

    try {
      const extracted = await extractDocument(file, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            setState({ status: "extracting", progress });
          }
        },
      });

      if (controller.signal.aborted) {
        if (extracted.previewUrl) {
          URL.revokeObjectURL(extracted.previewUrl);
        }
        return;
      }

      previewUrlRef.current = extracted.previewUrl;
      setState({
        status: "review",
        draft: {
          file,
          previewUrl: extracted.previewUrl,
          pageCount: extracted.pageCount,
          method: extracted.method,
          mimeType: extracted.mimeType,
          fileKind: extracted.fileKind,
          text: extracted.text,
        },
        busy: false,
        progress: 0,
        error: null,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      fail(
        error instanceof Error
          ? error.message
          : "The document could not be processed.",
      );
    } finally {
      if (extractionRef.current === controller) {
        extractionRef.current = null;
      }
    }
  };

  const handleIngest = () => {
    if (state.status !== "review" || state.busy) {
      return;
    }

    const draft = state.draft;
    const pages = splitExtractedPages(draft.text);

    if (pages.length === 0) {
      reviewError("Add some extracted text before ingesting this document.");
      return;
    }

    const formData = new FormData();
    formData.append("file", draft.file);
    formData.append(
      "title",
      title.trim() || titleFromFileName(draft.file.name),
    );
    formData.append("extractedText", draft.text);
    formData.append(
      "pageTexts",
      JSON.stringify(
        pages.map((page) => ({ page: page.page, text: page.text })),
      ),
    );
    formData.append("pageCount", String(draft.pageCount));
    formData.append("extractionMethod", draft.method);

    if (targetTrailId) {
      formData.append("trailId", targetTrailId);
    }

    const xhr = new XMLHttpRequest();
    requestRef.current = xhr;

    xhr.open("POST", "/api/documents/upload");
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.min(
        55,
        Math.round((event.loaded / event.total) * 55),
      );

      setState((current) =>
        current.status === "review"
          ? { ...current, progress }
          : current,
      );
    };

    xhr.upload.onload = () => {
      setState((current) =>
        current.status === "review"
          ? { ...current, progress: 65 }
          : current,
      );
    };

    xhr.onload = () => {
      requestRef.current = null;

      let payload: ApiResponse | null = null;

      try {
        payload = JSON.parse(xhr.responseText) as ApiResponse;
      } catch {
        // Platform-level errors sometimes return HTML rather than JSON.
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.document) {
        const document = payload.document;
        const displayText = displayExtractedText(pages).slice(
          0,
          LOCAL_NOTE_BODY_MAX_CHARS,
        );

        releasePreview();
        setState({ status: "success", document });
        setTitle("");
        onDocumentCreated({
          documentId: document.documentId,
          title: document.title,
          content: displayText,
          chunks: document.chunks,
          tokens: document.tokens,
          sourceName: draft.file.name,
          pageCount: draft.pageCount,
          extraction: document.extractionMethod ?? draft.method,
          trailId: targetTrailId ?? null,
        });
        return;
      }

      reviewError(
        payload?.error ??
          `The upload failed with status ${xhr.status}. Try again.`,
      );
    };

    xhr.onerror = () => {
      requestRef.current = null;
      reviewError(
        "The network request failed. Check your connection and try again.",
      );
    };

    xhr.ontimeout = () => {
      requestRef.current = null;
      reviewError(
        "The upload timed out. Try a smaller document or retry in a moment.",
      );
    };

    setState((current) =>
      current.status === "review"
        ? { ...current, busy: true, progress: 0, error: null }
        : current,
    );
    xhr.send(formData);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);

    if (busy || reviewing) {
      return;
    }

    const file = event.dataTransfer.files?.[0];

    if (file) {
      void beginExtraction(file);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  };

  const closeReview = () => {
    if (state.status !== "review" || state.busy) {
      return;
    }

    releasePreview();
    setState({ status: "idle" });
  };

  return (
    <div className="space-y-5" aria-busy={busy}>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label
            htmlFor="document-title"
            className="text-[14.5px] font-medium tracking-[-0.005em] text-neutral-300"
          >
            Title
          </label>
          <span className="text-[13px] text-neutral-400">Optional</span>
        </div>
        <input
          id="document-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Defaults to the file name"
          maxLength={200}
          disabled={busy || reviewing}
          className="field-control"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void beginExtraction(file);
          }
        }}
      />

      <button
        type="button"
        disabled={busy || reviewing}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy && !reviewing) {
            setDragging(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && !reviewing) {
            setDragging(true);
          }
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-describedby="document-upload-hint"
        className={`group flex w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-10 text-center transition duration-200 disabled:cursor-wait ${
          dragging
            ? "border-white/40 bg-white/[0.07]"
            : "border-white/15 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.035]"
        }`}
      >
        <span
          className={`grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-neutral-300 transition duration-200 ${
            dragging ? "scale-105 text-white" : "group-hover:text-white"
          }`}
        >
          <UploadIcon className="size-5" />
        </span>

        <span className="space-y-1.5">
          <span className="block text-[16px] font-medium tracking-[-0.01em] text-white">
            {busy ? "Processing your document" : "Drop a document here"}
          </span>
          <span className="block text-[14.5px] text-mist-dim">
            {busy ? (
              "Extracting, chunking and embedding"
            ) : (
              <>
                or{" "}
                <span className="text-neutral-300 underline decoration-white/25 underline-offset-4">
                  browse files
                </span>
              </>
            )}
          </span>
        </span>

        <span
          id="document-upload-hint"
          className="flex items-center gap-1.5 text-center font-mono text-[12px] uppercase tracking-[0.16em] text-neutral-400"
        >
          <FileTextIcon className="size-3.5" />
          PDF, PNG, JPG, WebP, BMP · up to {DOCUMENT_MAX_LABEL}
        </span>
      </button>

      <div aria-live="polite" className="min-h-0">
        {state.status === "extracting" ? (
          <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Spinner className="shrink-0 text-neutral-300" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[14.5px] text-mist">
                    {state.progress.label}
                  </span>
                  {state.progress.pages > 0 ? (
                    <span className="shrink-0 font-mono text-[12px] text-neutral-400">
                      {state.progress.page} / {state.progress.pages}
                    </span>
                  ) : null}
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={state.progress.progress}
                  aria-label="Text extraction progress"
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
                >
                  <div
                    className="h-full rounded-full bg-white transition-[width] duration-200"
                    style={{ width: `${state.progress.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/[0.045] p-4">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white">
              <CheckIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-white">
                {state.document.title}
              </p>
              <p className="mt-1 text-[14px] leading-5 text-mist">
                {friendlyMethod(state.document.extractionMethod)} ·{" "}
                {state.document.chunks.toLocaleString("en-US")} chunks ·{" "}
                {state.document.tokens.toLocaleString("en-US")} tokens
              </p>
              <p className="mt-1 text-[13.5px] leading-5 text-neutral-400">
                {targetTrailId
                  ? "Added to your active trail and searchable now."
                  : "A new trail was opened and is searchable now."}
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-2 text-[14px] font-medium text-neutral-300 underline decoration-white/20 underline-offset-4 transition hover:text-white"
              >
                Upload another
              </button>
            </div>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-red-200"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-[14.5px] leading-5">{state.message}</p>
              <button
                type="button"
                onClick={reset}
                className="mt-1.5 text-[14px] font-medium text-red-100 underline decoration-red-200/30 underline-offset-4 transition hover:text-white"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {state.status === "review" ? (
        <OcrReviewDialog
          fileName={state.draft.file.name}
          previewUrl={state.draft.previewUrl}
          fileKind={state.draft.fileKind}
          pageCount={state.draft.pageCount}
          method={state.draft.method}
          title={title}
          text={state.draft.text}
          busy={state.busy}
          progress={state.progress}
          error={state.error}
          onTitleChange={setTitle}
          onTextChange={(value) =>
            setState((current) =>
              current.status === "review"
                ? {
                    ...current,
                    draft: { ...current.draft, text: value },
                    error: null,
                  }
                : current,
            )
          }
          onClose={closeReview}
          onIngest={handleIngest}
        />
      ) : null}
    </div>
  );
}
