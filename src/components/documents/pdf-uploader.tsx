"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import {
  PDF_MAX_BYTES,
  PDF_MAX_LABEL,
  PDF_MIME,
} from "@/lib/ingestion/constants";
import {
  AlertIcon,
  CheckIcon,
  FileTextIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

type UploadedDocument = {
  documentId: string;
  title: string;
  pages: number;
  textPages: number;
  chunks: number;
  tokens: number;
  model: string;
  dimensions: number;
  batchSize: number;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "processing" }
  | { status: "success"; document: UploadedDocument }
  | { status: "error"; message: string };

type ApiResponse = {
  document?: UploadedDocument;
  error?: string;
};

export function PdfUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const router = useRouter();

  const busy = state.status === "uploading" || state.status === "processing";

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  const reset = () => {
    setState({ status: "idle" });
    setTitle("");
  };

  const fail = (message: string) => setState({ status: "error", message });

  const beginUpload = (file: File) => {
    if (busy) {
      return;
    }

    const looksLikePdf =
      file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      fail("Choose a PDF file.");
      return;
    }

    if (file.size === 0) {
      fail("That file is empty.");
      return;
    }

    if (file.size > PDF_MAX_BYTES) {
      fail(`This PDF is larger than ${PDF_MAX_LABEL}.`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const trimmedTitle = title.trim();

    if (trimmedTitle) {
      formData.append("title", trimmedTitle);
    }

    const xhr = new XMLHttpRequest();
    requestRef.current = xhr;

    xhr.open("POST", "/api/documents/upload");
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
      setState({ status: "uploading", progress });
    };

    xhr.upload.onload = () => setState({ status: "processing" });

    xhr.onload = () => {
      requestRef.current = null;

      let payload: ApiResponse | null = null;

      try {
        payload = JSON.parse(xhr.responseText) as ApiResponse;
      } catch {
        // Non-JSON responses usually come from a platform-level error page.
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.document) {
        setState({ status: "success", document: payload.document });
        setTitle("");
        router.refresh();
        return;
      }

      fail(
        payload?.error ??
          `The upload failed with status ${xhr.status}. Try again.`,
      );
    };

    xhr.onerror = () => {
      requestRef.current = null;
      fail("The network request failed. Check your connection and try again.");
    };

    xhr.ontimeout = () => {
      requestRef.current = null;
      fail("The upload timed out. Try a smaller PDF or retry in a moment.");
    };

    setState({ status: "uploading", progress: 0 });
    xhr.send(formData);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);

    if (busy) {
      return;
    }

    const file = event.dataTransfer.files?.[0];

    if (file) {
      beginUpload(file);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  };

  return (
    <div className="space-y-5" aria-busy={busy}>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label
            htmlFor="document-title"
            className="text-[12.5px] font-medium tracking-[-0.005em] text-neutral-300"
          >
            Title
          </label>
          <span className="text-[11px] text-neutral-500">Optional</span>
        </div>
        <input
          id="document-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Defaults to the file name"
          maxLength={200}
          disabled={busy}
          className="field-control"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={`${PDF_MIME},.pdf`}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            beginUpload(file);
          }
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy) {
            setDragging(true);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) {
            setDragging(true);
          }
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-describedby="pdf-upload-hint"
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
          <span className="block text-[14px] font-medium tracking-[-0.01em] text-white">
            {busy ? "Processing your document" : "Drop a PDF here"}
          </span>
          <span className="block text-[12.5px] text-mist-dim">
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
          id="pdf-upload-hint"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500"
        >
          <FileTextIcon className="size-3.5" />
          PDF only · up to {PDF_MAX_LABEL}
        </span>
      </button>

      <div aria-live="polite" className="min-h-0">
        {state.status === "uploading" ? (
          <div>
            <div className="flex items-center justify-between text-[12px] text-mist">
              <span>Uploading PDF</span>
              <span className="font-mono text-[11px] text-neutral-400">
                {state.progress}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.progress}
              aria-label="Upload progress"
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-white transition-[width] duration-200"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {state.status === "processing" ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12.5px] text-mist">
            <Spinner className="text-neutral-300" />
            Extracting text, chunking and generating embeddings…
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/[0.045] p-4">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white">
              <CheckIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-white">
                {state.document.title}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-mist">
                {state.document.chunks.toLocaleString("en-US")} chunks from{" "}
                {state.document.pages.toLocaleString("en-US")} pages ·{" "}
                {state.document.tokens.toLocaleString("en-US")} tokens ·{" "}
                {state.document.dimensions}-dim embeddings
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-2 text-[12px] font-medium text-neutral-300 underline decoration-white/20 underline-offset-4 transition hover:text-white"
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
              <p className="text-[12.5px] leading-5">{state.message}</p>
              <button
                type="button"
                onClick={reset}
                className="mt-1.5 text-[12px] font-medium text-red-100 underline decoration-red-200/30 underline-offset-4 transition hover:text-white"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
