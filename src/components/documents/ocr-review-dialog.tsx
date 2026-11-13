"use client";

import { createPortal } from "react-dom";

import { CenteredStage } from "@/components/dashboard/overlay";
import { CloseIcon, SparkIcon } from "@/components/ui/dashboard-icons";
import { FileTextIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import type { ExtractionMethod } from "@/lib/documents/types";

function methodLabel(method: ExtractionMethod) {
  if (method === "ocr") return "OCR";
  if (method === "text-layer") return "PDF text layer";
  return "Text layer + OCR";
}

export function OcrReviewDialog({
  fileName,
  previewUrl,
  fileKind,
  pageCount,
  method,
  title,
  text,
  busy,
  progress,
  error,
  onTitleChange,
  onTextChange,
  onClose,
  onIngest,
}: {
  fileName: string;
  previewUrl: string | null;
  fileKind: "pdf" | "image";
  pageCount: number;
  method: ExtractionMethod;
  title: string;
  text: string;
  busy: boolean;
  progress: number;
  error: string | null;
  onTitleChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onClose: () => void;
  onIngest: () => void;
}) {
  const words = text.trim()
    ? text.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const requestClose = () => {
    if (!busy) {
      onClose();
    }
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <CenteredStage
      open
      onClose={requestClose}
      labelledBy="ocr-review-title"
      className="max-w-[78rem]"
    >
      <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
        <div className="min-w-0">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.28em] text-neutral-400">
            OCR review
          </p>
          <h2
            id="ocr-review-title"
            className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-white sm:text-[1.35rem]"
          >
            Verify what we extracted
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14.5px] leading-5 text-mist">
            Compare the original against the raw text. Anything you edit here
            is what gets chunked and embedded into your trail.
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          disabled={busy}
          aria-label="Close OCR review"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-wait disabled:opacity-40"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
        <section className="flex min-h-0 flex-col border-b border-white/[0.07] lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-neutral-400">
              Original document
            </p>
            <span className="max-w-[16rem] truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-400">
              {fileName}
            </span>
          </div>

          <div className="min-h-[18rem] flex-1 overflow-auto bg-black/25 p-4 sm:p-5 lg:min-h-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`Preview of ${fileName}`}
                className="mx-auto max-h-[62vh] w-auto max-w-full rounded-lg border border-white/[0.09] bg-white object-contain shadow-[0_24px_80px_-30px_rgba(0,0,0,1)]"
              />
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.1] px-6 text-center">
                <FileTextIcon className="size-6 text-neutral-500" />
                <p className="mt-3 max-w-xs text-[14px] leading-5 text-neutral-400">
                  A visual preview is not available, but the extracted text is
                  ready to review.
                </p>
              </div>
            )}

            {fileKind === "pdf" ? (
              <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                Previewing page 1 of {pageCount}
              </p>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3">
            <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-neutral-400">
              Extracted text
            </p>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-400">
              {methodLabel(method)} · {pageCount} page
              {pageCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5">
            <div>
              <label
                htmlFor="ocr-document-title"
                className="mb-1.5 flex items-baseline justify-between gap-3 text-[14.5px] font-medium text-neutral-300"
              >
                Title
                <span className="text-[13px] font-normal text-neutral-500">
                  Optional
                </span>
              </label>
              <input
                id="ocr-document-title"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder="Defaults to the file name"
                maxLength={200}
                disabled={busy}
                className="field-control"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label
                  htmlFor="ocr-document-text"
                  className="text-[14.5px] font-medium text-neutral-300"
                >
                  Raw text
                </label>
                <span className="font-mono text-[12px] text-neutral-500">
                  {words.toLocaleString("en-US")} words
                </span>
              </div>
              <textarea
                id="ocr-document-text"
                value={text}
                onChange={(event) => onTextChange(event.target.value)}
                disabled={busy}
                autoFocus={!busy}
                spellCheck={false}
                className="min-h-[20rem] flex-1 resize-none rounded-xl border border-white/[0.09] bg-white/[0.028] px-4 py-3 font-mono text-[14px] leading-6 text-white outline-none transition placeholder:text-neutral-500 hover:border-white/15 focus:border-white/25 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(255,255,255,0.05)] disabled:opacity-60 lg:min-h-0"
              />
              <p className="mt-1.5 text-[13px] leading-5 text-neutral-500">
                Page markers stay in the text so each chunk keeps its page
                number. Remove them to treat the document as one page.
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-[14px] leading-5 text-red-200"
              >
                {error}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-white/[0.07] px-5 py-4 sm:px-7">
        {busy ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Document ingestion progress"
            className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-[13px] leading-5 text-neutral-500">
            The original file is stored privately. OCR runs in your browser; the
            edited text is chunked and embedded server-side.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 text-[14px] font-medium text-neutral-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onIngest}
              disabled={busy || !text.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[14.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? (
                <>
                  <Spinner className="size-4" />
                  Embedding {progress}%
                </>
              ) : (
                <>
                  <SparkIcon className="size-4" />
                  Ingest document
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </CenteredStage>,
    document.body,
  );
}
