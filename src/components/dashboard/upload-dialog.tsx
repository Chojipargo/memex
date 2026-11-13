"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DocumentUploader } from "@/components/documents/document-uploader";
import { DialogFrame, DialogHeader } from "@/components/dashboard/overlay";
import { SparkIcon } from "@/components/ui/dashboard-icons";
import { FileTextIcon, UploadIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import type { DocumentCreated } from "@/lib/documents/types";
import { NOTE_MAX_BYTES, NOTE_MAX_LABEL } from "@/lib/ingestion/constants";

export type NoteCreated = DocumentCreated;

type UploadTab = "pdf" | "note";

type NoteResponse = {
  document?: {
    documentId: string;
    title: string;
    chunks: number;
    tokens: number;
  };
  error?: string;
};

export function UploadDialog({
  open,
  onClose,
  initialTab = "pdf",
  initialDraft,
  targetTrailId,
  onNoteCreated,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: UploadTab;
  initialDraft?: { title?: string; content?: string } | null;
  targetTrailId?: string | null;
  onNoteCreated: (note: NoteCreated) => void;
  onNotify: (message: string) => void;
}) {
  const [tab, setTab] = useState<UploadTab>(initialTab);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [content, setContent] = useState(initialDraft?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textFileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const saveNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!content.trim() || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/documents/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content }),
      });

      const payload = (await response.json().catch(() => null)) as
        | NoteResponse
        | null;

      if (!response.ok || !payload?.document) {
        throw new Error(
          payload?.error ?? `The note could not be saved (${response.status}).`,
        );
      }

      const document = payload.document;

      onNoteCreated({
        documentId: document.documentId,
        title: document.title,
        content: content.trim(),
        chunks: document.chunks,
        tokens: document.tokens,
        extraction: "note",
      });
      onNotify("Note embedded in your Memex.");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The note could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentCreated = (document: DocumentCreated) => {
    onNoteCreated(document);
    onNotify(
      document.trailId
        ? "Document text extracted and added to your active trail."
        : "Document indexed. Ask a question about it to build a trail.",
    );
    router.refresh();
  };

  const importTextFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (file.size > NOTE_MAX_BYTES) {
      setError(`Text files are limited to ${NOTE_MAX_LABEL}.`);
      return;
    }

    try {
      const text = await file.text();
      setContent(text);
      setError(null);

      if (!title.trim()) {
        setTitle(
          file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .trim()
            .slice(0, 200),
        );
      }
    } catch {
      setError("That text file could not be read.");
    }
  };

  const words = content.trim()
    ? content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      labelledBy="upload-title"
      className="max-w-[46rem]"
    >
      <DialogHeader
        id="upload-title"
        eyebrow="Add to your Memex"
        title="Bring something into memory"
        description="Upload a PDF or image, import a text file, or write a note. Scanned pages are read with OCR, then every source is chunked, embedded, and connected to your graph."
        onClose={onClose}
      />

      <div className="flex items-center gap-1 border-b border-white/[0.06] px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setTab("pdf")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium transition ${
            tab === "pdf"
              ? "bg-white/[0.08] text-white"
              : "text-neutral-400 hover:bg-white/[0.035] hover:text-neutral-200"
          }`}
        >
          <FileTextIcon className="size-4" />
          Upload document
        </button>
        <button
          type="button"
          onClick={() => setTab("note")}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-medium transition ${
            tab === "note"
              ? "bg-white/[0.08] text-white"
              : "text-neutral-400 hover:bg-white/[0.035] hover:text-neutral-200"
          }`}
        >
          <SparkIcon className="size-4" />
          Note or text
        </button>
      </div>

      <div className="p-4 sm:p-6">
        {tab === "pdf" ? (
          <div>
            <DocumentUploader
              targetTrailId={targetTrailId}
              onDocumentCreated={handleDocumentCreated}
            />
            <p className="mt-4 text-[13px] leading-5 text-neutral-500">
              Documents are stored privately in Supabase Storage. Text-layer
              PDFs are read directly; scanned pages and images are processed
              with OCR in your browser before anything is embedded.
            </p>
          </div>
        ) : (
          <form onSubmit={saveNote} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] leading-5 text-mist">
                Write freely, paste from your clipboard, or import a{" "}
                <span className="text-neutral-300">.txt</span> /{" "}
                <span className="text-neutral-300">.md</span> file.
              </p>
              <button
                type="button"
                onClick={() => textFileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[13.5px] text-neutral-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
              >
                <UploadIcon className="size-3.5" />
                Import text file
              </button>
              <input
                ref={textFileRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void importTextFile(file);
                }}
              />
            </div>

            <div>
              <label
                htmlFor="note-title"
                className="mb-1.5 flex items-baseline justify-between gap-3 text-[14.5px] font-medium text-neutral-300"
              >
                Title
                <span className="text-[13px] font-normal text-neutral-500">
                  Optional
                </span>
              </label>
              <input
                id="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give this thought a name"
                maxLength={200}
                disabled={saving}
                className="field-control"
              />
            </div>

            <div>
              <label
                htmlFor="note-content"
                className="mb-1.5 flex items-baseline justify-between gap-3 text-[14.5px] font-medium text-neutral-300"
              >
                Note
                <span className="font-mono text-[12px] font-normal text-neutral-500">
                  {words.toLocaleString("en-US")} words
                </span>
              </label>
              <textarea
                id="note-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Start with a question, a quotation, or the thought you don't want to lose..."
                disabled={saving}
                className="min-h-[12rem] w-full resize-y rounded-xl border border-white/[0.09] bg-white/[0.028] px-4 py-3 text-[15.5px] leading-6 text-white outline-none transition placeholder:text-neutral-500 hover:border-white/15 focus:border-white/25 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(255,255,255,0.05)] disabled:opacity-60"
              />
              <p className="mt-1.5 flex items-center justify-between gap-3 text-[13px] text-neutral-500">
                <span>
                  Split into 500–800 token chunks with a 100-token overlap.
                </span>
                <span className="font-mono">{NOTE_MAX_LABEL} max</span>
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3 text-[14px] leading-5 text-neutral-100"
              >
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] pt-4">
              <p className="hidden text-[13px] leading-5 text-neutral-500 sm:block">
                The note stays private. Only you can read its embeddings.
              </p>
              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[14.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? (
                  <>
                    <Spinner className="size-4" />
                    Embedding…
                  </>
                ) : (
                  <>
                    <SparkIcon className="size-4" />
                    Embed note
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </DialogFrame>
  );
}
