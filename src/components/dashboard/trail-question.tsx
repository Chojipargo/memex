"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { postTrailQuestion, type TrailApi } from "@/lib/trails/api";

export const QUESTION_MIN_CHARS = 3;
export const QUESTION_MAX_CHARS = 500;

/** Switch from "finding" to "building" after this long; the API gives no progress. */
const BUILDING_LABEL_DELAY_MS = 2800;

type Phase = "idle" | "finding" | "building";

export type TrailQuestionError = {
  message: string;
  lowCoverage: boolean;
};

/**
 * Shared submit state for asking a trail endpoint a question: pending phase
 * with a time-based status label, inline error, and a double-submit guard.
 */
export function useTrailQuestion(url: string) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<TrailQuestionError | null>(null);
  const busyRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const submit = useCallback(
    async (rawQuestion: string): Promise<TrailApi | null> => {
      if (busyRef.current) {
        return null;
      }

      const question = rawQuestion.trim();

      if (question.length < QUESTION_MIN_CHARS) {
        setError({
          message: "Ask a question with at least 3 characters.",
          lowCoverage: false,
        });
        return null;
      }

      if (question.length > QUESTION_MAX_CHARS) {
        setError({
          message: "Questions are limited to 500 characters.",
          lowCoverage: false,
        });
        return null;
      }

      busyRef.current = true;
      setError(null);
      setPhase("finding");
      timerRef.current = window.setTimeout(() => {
        setPhase((current) => (current === "finding" ? "building" : current));
      }, BUILDING_LABEL_DELAY_MS);

      try {
        const result = await postTrailQuestion(url, question);

        if (!result.ok) {
          setError({ message: result.message, lowCoverage: result.lowCoverage });
          return null;
        }

        return result.trail;
      } finally {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }

        busyRef.current = false;
        setPhase("idle");
      }
    },
    [url],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    pending: phase !== "idle",
    statusLabel:
      phase === "finding"
        ? "Finding passages…"
        : phase === "building"
          ? "Building the path…"
          : "",
    error,
    submit,
    clearError,
  };
}

export function TrailQuestionAlert({
  id,
  error,
  onUploadSource,
  className = "",
}: {
  id: string;
  error: TrailQuestionError | null;
  onUploadSource: () => void;
  className?: string;
}) {
  if (!error) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className={`text-left text-[11.5px] leading-5 text-neutral-300 ${className}`}
    >
      {error.message}
      {error.lowCoverage ? (
        <>
          {" "}
          <button
            type="button"
            onClick={onUploadSource}
            className="rounded font-medium text-white underline decoration-white/30 underline-offset-[3px] transition hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Upload a source
          </button>
        </>
      ) : null}
    </p>
  );
}
