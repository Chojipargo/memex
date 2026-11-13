"use client";

import { type FormEvent, useId, useState } from "react";

import { DialogFrame, DialogHeader } from "@/components/dashboard/overlay";
import {
  QUESTION_MAX_CHARS,
  TrailQuestionAlert,
  useTrailQuestion,
} from "@/components/dashboard/trail-question";
import {
  ArrowUpRightIcon,
  SearchIcon,
  SparkIcon,
} from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import type { ProgressStage } from "@/lib/rag/types";
import type { TrailApi } from "@/lib/trails/api";

const STAGES: Array<{ stage: ProgressStage; label: string }> = [
  { stage: "searching", label: "Searching personal trails..." },
  {
    stage: "researching",
    label: "Information not found locally, researching external sources...",
  },
  { stage: "weaving", label: "Weaving new trail nodes..." },
];

const STAGE_ORDER: Record<ProgressStage, number> = {
  searching: 0,
  researching: 1,
  weaving: 2,
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ResearchDialog({
  open,
  onClose,
  onTrailBuilt,
  onUploadSource,
}: {
  open: boolean;
  onClose: () => void;
  onTrailBuilt: (trail: TrailApi) => void;
  onUploadSource: () => void;
}) {
  const titleId = useId();
  const [topic, setTopic] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"topic" | "url">("topic");
  const { pending, stage, statusLabel, error, submit, clearError } =
    useTrailQuestion("/api/trails");

  const reset = () => {
    setTopic("");
    setUrl("");
    setMode("topic");
    clearError();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const trimmedTopic = topic.trim();
  const trimmedUrl = url.trim();
  const topicValid =
    trimmedTopic.length === 0 ||
    (trimmedTopic.length >= 3 && trimmedTopic.length <= QUESTION_MAX_CHARS);
  const canSubmit =
    !pending &&
    (mode === "topic"
      ? trimmedTopic.length >= 3 &&
        trimmedTopic.length <= QUESTION_MAX_CHARS
      : isHttpUrl(trimmedUrl) && topicValid);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const trail = await submit(
      trimmedTopic || "Research this source",
      {
        mode: "research",
        ...(mode === "url" && trimmedUrl ? { url: trimmedUrl } : {}),
      },
    );

    if (trail) {
      onTrailBuilt(trail);
      handleClose();
    }
  };

  const activeStage = stage ? STAGE_ORDER[stage] : -1;

  return (
    <DialogFrame open={open} onClose={handleClose} labelledBy={titleId}>
      <DialogHeader
        id={titleId}
        eyebrow="Web research"
        title="Generate a trail from a topic"
        description="Ask a question or point at a URL. memex searches its own trails first, then researches authoritative sources and weaves the result into an editable trail."
        onClose={handleClose}
      />

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex gap-1.5 rounded-xl border border-white/[0.08] bg-black/20 p-1">
            {(
              [
                ["topic", "Topic or question"],
                ["url", "Paste a URL"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  clearError();
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-[13.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                  mode === value
                    ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-neutral-400">
              {mode === "url"
                ? "What should this source connect to? (optional)"
                : "Topic or question"}
            </span>
            <textarea
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                clearError();
              }}
              rows={3}
              maxLength={QUESTION_MAX_CHARS}
              autoFocus
              placeholder={
                mode === "url"
                  ? "How does this source change my understanding of…"
                  : "e.g. How do associative trails differ from folders?"
              }
              className="mt-2 w-full resize-none rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-3 text-[15px] leading-6 text-white placeholder:text-neutral-500 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/10"
            />
            <span className="mt-1.5 block text-right font-mono text-[11.5px] text-neutral-500">
              {topic.trim().length}/{QUESTION_MAX_CHARS}
            </span>
          </label>

          {mode === "url" ? (
            <label className="block">
              <span className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-neutral-400">
                Source URL
              </span>
              <input
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  clearError();
                }}
                placeholder="https://example.com/article"
                className="mt-2 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-3 text-[15px] text-white placeholder:text-neutral-500 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/10"
              />
              <span className="mt-1.5 flex items-center gap-1.5 text-[13px] text-neutral-400">
                <ArrowUpRightIcon className="size-3" />
                Public pages only. The text is embedded into your library.
              </span>
            </label>
          ) : null}

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-4">
            <div className="flex items-center gap-2">
              {pending ? <Spinner /> : <SearchIcon className="size-3.5 text-neutral-400" />}
              <p className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-neutral-400">
                Research path
              </p>
            </div>
            <ol className="mt-3 space-y-2.5">
              {STAGES.map((item, index) => {
                const state =
                  activeStage > index
                    ? "done"
                    : activeStage === index
                      ? "active"
                      : "idle";

                return (
                  <li key={item.stage} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`mt-1 size-1.5 shrink-0 rounded-full ${
                        state === "done"
                          ? "bg-white/70"
                          : state === "active"
                            ? "animate-pulse bg-white"
                            : "bg-white/20"
                      }`}
                    />
                    <span
                      className={`text-[13.5px] leading-5 ${
                        state === "idle" ? "text-neutral-500" : "text-neutral-300"
                      }`}
                    >
                      {pending && state === "active" ? statusLabel || item.label : item.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <TrailQuestionAlert
            id="research-error"
            error={error}
            onUploadSource={onUploadSource}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-[13px] leading-4 text-neutral-400">
            Researched sources are saved to your library for future questions.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white px-4 py-2.5 text-[14px] font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {pending ? <Spinner /> : <SparkIcon className="size-3.5" />}
            {pending ? "Researching…" : "Build researched trail"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
