"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { NextStepProposals } from "@/components/dashboard/next-step-proposals";
import {
  QUESTION_MAX_CHARS,
  TrailQuestionAlert,
  useTrailQuestion,
} from "@/components/dashboard/trail-question";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import type { TrailApi } from "@/lib/trails/api";

/** Follow-up box shown after the last step of a generated trail. */
export function ContinueTrail({
  apiTrailId,
  autoFocus = false,
  onContinued,
  onUploadSource,
  onStartNewTrail,
}: {
  apiTrailId: string;
  /** Focus the follow-up box on mount, e.g. for a just-started side trail. */
  autoFocus?: boolean;
  onContinued: (trail: TrailApi) => void;
  onUploadSource: () => void;
  /** Build a separate trail from the typed question instead of appending. */
  onStartNewTrail: (question: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const { pending, statusLabel, error, submit, clearError } = useTrailQuestion(
    `/api/trails/${encodeURIComponent(apiTrailId)}/continue`,
  );
  const canStartNew = question.trim().length >= 3 && !pending;

  useEffect(() => {
    if (error) {
      inputRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus({ preventScroll: false });
    }
  }, [autoFocus]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trail = await submit(question);

    if (trail) {
      setQuestion("");
      onContinued(trail);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.015] p-3.5">
      <form onSubmit={handleSubmit} aria-busy={pending}>
        <label
          htmlFor={inputId}
          className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[0.2em] text-neutral-400"
        >
          <SparkIcon className="size-3" />
          Continue this trail
        </label>
        <p id={hintId} className="mt-1 text-[13px] leading-4 text-neutral-500">
          Continue adds 2–4 steps, researching the web if needed. Or let Claude
          suggest where to go next from the last passage and pick one.
        </p>

        <div className="mt-2.5 flex items-center gap-2">
          <input
            id={inputId}
            ref={inputRef}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);

              if (error) {
                clearError();
              }
            }}
            placeholder="What does this make you wonder?"
            autoComplete="off"
            maxLength={QUESTION_MAX_CHARS}
            readOnly={pending}
            aria-disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[14.5px] text-white outline-none transition placeholder:text-neutral-500 focus:border-white/25 aria-disabled:text-neutral-400"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-3.5 text-[13.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-progress disabled:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {pending ? (
              <>
                <Spinner />
                <span className="hidden sm:inline">{statusLabel}</span>
              </>
            ) : (
              <>
                <span className="sr-only sm:not-sr-only">Continue</span>
                <ArrowRightIcon className="size-3.5" />
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          disabled={!canStartNew}
          onClick={() => onStartNewTrail(question.trim())}
          className="mt-2 rounded text-[13px] text-neutral-400 underline decoration-white/15 underline-offset-[3px] transition hover:text-white hover:decoration-white/60 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Start a new trail with this question instead
        </button>

        <span role="status" aria-live="polite" className="sr-only">
          {statusLabel}
        </span>

        <TrailQuestionAlert
          id={errorId}
          error={error}
          onUploadSource={onUploadSource}
          className="mt-2"
        />
      </form>
      <NextStepProposals
        apiTrailId={apiTrailId}
        question={question}
        disabled={pending}
        onContinued={(trail) => {
          setQuestion("");
          onContinued(trail);
        }}
      />
    </div>
  );
}
