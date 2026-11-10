"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";

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
  onContinued,
  onUploadSource,
}: {
  apiTrailId: string;
  onContinued: (trail: TrailApi) => void;
  onUploadSource: () => void;
}) {
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const { pending, statusLabel, error, submit, clearError } = useTrailQuestion(
    `/api/trails/${encodeURIComponent(apiTrailId)}/continue`,
  );

  useEffect(() => {
    if (error) {
      inputRef.current?.focus();
    }
  }, [error]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trail = await submit(question);

    if (trail) {
      setQuestion("");
      onContinued(trail);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={pending}
      className="mt-4 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.015] p-3.5"
    >
      <label
        htmlFor={inputId}
        className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500"
      >
        <SparkIcon className="size-3" />
        Continue this trail
      </label>

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
          aria-describedby={error ? errorId : undefined}
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[12.5px] text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25 aria-disabled:text-neutral-400"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-3.5 text-[11.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-progress disabled:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
  );
}
