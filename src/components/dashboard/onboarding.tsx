"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { CheckIcon } from "@/components/ui/icons";

type StepState = "done" | "current" | "upcoming";

function OnboardingStep({
  index,
  state,
  title,
  children,
}: {
  index: number;
  state: StepState;
  title: string;
  children: ReactNode;
}) {
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={`relative flex flex-col rounded-[1.1rem] border p-4 transition sm:p-5 ${
        state === "current"
          ? "border-white/25 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_70px_-40px_rgba(255,255,255,0.3)]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[9.5px] ${
            state === "done"
              ? "border-white/25 bg-white/[0.1] text-white"
              : state === "current"
                ? "border-white/40 bg-white/[0.12] text-white"
                : "border-white/[0.12] text-neutral-500"
          }`}
        >
          {state === "done" ? (
            <CheckIcon className="size-3.5" />
          ) : (
            String(index).padStart(2, "0")
          )}
        </span>
        <h3
          className={`text-[13px] font-medium tracking-[-0.01em] ${
            state === "upcoming" ? "text-neutral-400" : "text-white"
          }`}
        >
          {title}
        </h3>
        <span className="sr-only">
          {state === "done"
            ? "(done)"
            : state === "current"
              ? "(current step)"
              : ""}
        </span>
      </div>
      <div className="mt-3 flex flex-1 flex-col text-[11.5px] leading-5 text-neutral-500">
        {children}
      </div>
    </li>
  );
}

const actionClass = (primary: boolean) =>
  `mt-auto inline-flex h-9 w-fit items-center rounded-xl px-3.5 text-[11.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
    primary
      ? "bg-white text-neutral-950 hover:bg-neutral-200"
      : "border border-white/[0.1] bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
  }`;

export function Onboarding({
  hasSources,
  hasTrail,
  onUpload,
  onAsk,
}: {
  hasSources: boolean;
  hasTrail: boolean;
  onUpload: () => void;
  onAsk: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const current = !hasSources ? 1 : !hasTrail ? 2 : 3;
  const stateOf = (step: number): StepState =>
    step < current ? "done" : step === current ? "current" : "upcoming";

  return (
    <motion.section
      aria-labelledby="onboarding-title"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="workspace-panel p-5 sm:p-6"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-neutral-600">
        Getting started
      </p>
      <h2
        id="onboarding-title"
        className="mt-2 text-[1.1rem] font-semibold tracking-[-0.025em] text-white"
      >
        Collect, ask, follow
      </h2>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        <OnboardingStep index={1} state={stateOf(1)} title="Upload a source">
          <p>Add a PDF, an image, or a note. memex reads it and indexes every passage.</p>
          <button
            type="button"
            onClick={onUpload}
            className={`${actionClass(current === 1)} mt-4`}
          >
            Upload a source
          </button>
        </OnboardingStep>

        <OnboardingStep index={2} state={stateOf(2)} title="Ask a question">
          <p>Type a question in the box above. memex searches your library for it.</p>
          <button
            type="button"
            onClick={onAsk}
            className={`${actionClass(current === 2)} mt-4`}
          >
            Ask a question
          </button>
        </OnboardingStep>

        <OnboardingStep index={3} state={stateOf(3)} title="Follow your trail">
          <p>
            Each step is a real passage from your sources, with a note on why
            it comes next. Ask a follow-up to keep the trail going.
          </p>
        </OnboardingStep>
      </ol>
    </motion.section>
  );
}
