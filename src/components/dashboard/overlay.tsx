"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { CloseIcon } from "@/components/ui/dashboard-icons";

export function DialogFrame({
  open,
  onClose,
  labelledBy,
  children,
  className = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/55 p-0 backdrop-blur-md sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.6rem] border border-white/[0.1] bg-ink-900/95 shadow-[0_40px_120px_-30px_rgba(0,0,0,1)] backdrop-blur-2xl sm:rounded-[1.6rem] ${className}`}
          >
            <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function DrawerFrame({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 flex w-full max-w-[35rem] flex-col border-l border-white/[0.09] bg-ink-900/95 shadow-[-40px_0_120px_-45px_rgba(0,0,0,1)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-y-16 left-0 w-px bg-gradient-to-b from-transparent via-white/18 to-transparent" />
            {children}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function DialogHeader({
  eyebrow,
  title,
  description,
  onClose,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  onClose: () => void;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-neutral-500">
          {eyebrow}
        </p>
        <h2
          id={id}
          className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-white sm:text-[1.35rem]"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-lg text-[12.5px] leading-5 text-mist">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
