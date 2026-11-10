"use client";

import {
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  QUESTION_MAX_CHARS,
  TrailQuestionAlert,
  useTrailQuestion,
} from "@/components/dashboard/trail-question";
import {
  ArrowRightIcon,
  PlusIcon,
  SparkIcon,
} from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import { heroPhrases, promptSuggestions } from "@/lib/dashboard/data";
import type { TrailApi } from "@/lib/trails/api";

export const DEFAULT_HERO_PLACEHOLDER = "Ask a question to build a trail…";

export function DashboardHero({
  inputRef,
  placeholder = DEFAULT_HERO_PLACEHOLDER,
  onTrailBuilt,
  onSaveNote,
  onUploadSource,
  onSearch,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  onTrailBuilt: (trail: TrailApi) => void;
  onSaveNote: (prompt: string) => void;
  onUploadSource: () => void;
  onSearch: () => void;
}) {
  const [phrase, setPhrase] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const promptId = useId();
  const errorId = useId();
  const statusId = useId();
  const { pending, statusLabel, error, submit, clearError } =
    useTrailQuestion("/api/trails");

  // Return focus to the input when a question fails so it can be edited.
  useEffect(() => {
    if (error) {
      inputRef.current?.focus();
    }
  }, [error, inputRef]);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const timer = window.setInterval(() => {
      setPhrase((current) => (current + 1) % heroPhrases.length);
    }, 4600);

    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const ask = async (question: string) => {
    const trail = await submit(question);

    if (trail) {
      setPrompt("");
      onTrailBuilt(trail);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(prompt);
  };

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center pb-4 pt-16 text-center sm:pt-20 lg:pt-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-1.5 backdrop-blur-md"
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/50" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white/80" />
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-neutral-400">
          Your private associative memory
        </span>
      </motion.div>

      <h1 className="sr-only">Your associative memex workspace</h1>

      <div
        className="mt-8 flex min-h-[4.4rem] w-full items-center justify-center sm:min-h-[5.2rem] lg:min-h-[6.2rem]"
        style={{ perspective: "1200px" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={heroPhrases[phrase]}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    rotateX: -72,
                    y: 30,
                  }
            }
            animate={{
              opacity: 1,
              rotateX: 0,
              y: 0,
            }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    rotateX: 62,
                    y: -24,
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0.2 }
                : { duration: 0.72, ease: [0.16, 1, 0.3, 1] }
            }
            className="block w-full max-w-full text-balance text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-white drop-shadow-[0_10px_40px_rgba(0,0,0,0.55)] sm:max-w-[22ch] sm:text-[3.2rem] lg:max-w-none lg:text-[3.9rem]"
          >
            {heroPhrases[phrase]}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 max-w-xl text-balance text-[13.5px] leading-6 text-mist sm:text-[14px]"
      >
        Ask a question and memex builds a trail through your own sources:
        every step a real passage, with a note on why it comes next.
      </motion.p>

      <motion.form
        onSubmit={handleSubmit}
        aria-busy={pending}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className={`relative mt-8 w-full rounded-[1.35rem] border bg-gradient-to-b from-white/[0.085] to-white/[0.025] p-1.5 backdrop-blur-xl transition duration-300 sm:mt-10 ${
          focused
            ? "border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_28px_90px_-35px_rgba(255,255,255,0.22)]"
            : "border-white/[0.11] shadow-[0_26px_80px_-42px_rgba(0,0,0,1)]"
        }`}
      >
        <div className="pointer-events-none absolute inset-x-20 -top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <div className="flex items-center gap-2.5">
          <span className="ml-2 grid size-9 shrink-0 place-items-center rounded-xl text-neutral-400">
            <SparkIcon className="size-[18px]" />
          </span>

          <label htmlFor={promptId} className="sr-only">
            Ask a question to build a trail
          </label>
          <input
            id={promptId}
            ref={inputRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);

              if (error) {
                clearError();
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            autoComplete="off"
            maxLength={QUESTION_MAX_CHARS}
            readOnly={pending}
            aria-disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent pr-2 text-[14px] text-white outline-none placeholder:text-neutral-500 aria-disabled:text-neutral-400 sm:text-[14.5px]"
          />

          <button
            type="button"
            onClick={() => onSaveNote(prompt.trim())}
            disabled={pending}
            className="hidden h-11 shrink-0 items-center gap-1.5 rounded-[0.95rem] px-3 text-[11.5px] text-neutral-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:flex"
          >
            <PlusIcon className="size-3.5" />
            Save as note
          </button>

          <button
            type="submit"
            disabled={pending}
            className="group flex h-11 shrink-0 items-center gap-2 rounded-[0.95rem] border border-white/10 bg-white px-4 text-[12.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-progress disabled:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 sm:px-5"
          >
            {pending ? (
              <>
                <Spinner />
                <span className="hidden sm:inline">{statusLabel}</span>
              </>
            ) : (
              <>
                <span className="sr-only sm:not-sr-only">Build trail</span>
                <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </div>

        <span id={statusId} role="status" aria-live="polite" className="sr-only">
          {statusLabel}
        </span>

        <TrailQuestionAlert
          id={errorId}
          error={error}
          onUploadSource={onUploadSource}
          className="px-4 pt-2"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={pending}
                onClick={() => {
                  setPrompt(suggestion);
                  void ask(suggestion);
                }}
                className="rounded-full disabled:cursor-not-allowed disabled:opacity-40 border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[10.5px] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-neutral-100"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onSaveNote(prompt.trim())}
            disabled={pending}
            className="rounded-md px-2 py-1 text-[10.5px] text-neutral-500 transition hover:text-neutral-200 disabled:opacity-40 sm:hidden"
          >
            Save as note
          </button>

          <button
            type="button"
            onClick={onSearch}
            className="hidden items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-neutral-600 transition hover:text-neutral-300 sm:flex"
          >
            <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-neutral-400">
              ⌘K
            </kbd>
            search
          </button>
        </div>
      </motion.form>
    </section>
  );
}
