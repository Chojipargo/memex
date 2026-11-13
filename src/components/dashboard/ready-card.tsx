"use client";

import { motion, useReducedMotion } from "framer-motion";

import {
  ArrowRightIcon,
  CloseIcon,
} from "@/components/ui/dashboard-icons";
import { CheckIcon } from "@/components/ui/icons";

export type ReadySource = {
  documentId: string;
  title: string;
  chunks: number;
};

export function ReadyCard({
  source,
  onAsk,
  onDismiss,
}: {
  source: ReadySource;
  onAsk: () => void;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const passages = `${source.chunks.toLocaleString("en-US")} passage${
    source.chunks === 1 ? "" : "s"
  } indexed`;

  return (
    <motion.section
      aria-label={`${source.title} is ready`}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 rounded-[1.2rem] border border-white/[0.11] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:gap-4 sm:p-4 sm:pl-5"
    >
      <span className="hidden size-9 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.05] text-neutral-200 sm:grid">
        <CheckIcon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-neutral-400">
          Ready
        </p>
        <p className="mt-1 truncate text-[15px] text-neutral-200">
          <span className="font-medium text-white">{source.title}</span>{" "}
          <span className="text-neutral-400">is ready · {passages}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onAsk}
          className="group inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3.5 text-[13.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
        >
          Ask about this source
          <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss: ${source.title} is ready`}
          className="grid size-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>
    </motion.section>
  );
}
