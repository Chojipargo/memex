"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  originProvenance,
  ProvenancePill,
} from "@/components/dashboard/provenance-pill";
import { ChevronRightIcon } from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import type { Note } from "@/lib/dashboard/data";
import { parseChunkContext, type ChunkContext } from "@/lib/trails/context";
import { locateQuote } from "@/lib/trails/quote";
import { chunkIdOf } from "@/lib/trails/to-workspace";

const PASSAGE_PREVIEW_CHARS = 280;

type ContextState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; context: ChunkContext };

function preview(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PASSAGE_PREVIEW_CHARS
    ? `${flat.slice(0, PASSAGE_PREVIEW_CHARS).trimEnd()}…`
    : flat;
}

async function fetchContext(chunkId: number): Promise<ContextState> {
  try {
    const response = await fetch(`/api/chunks/${chunkId}/context`);
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Could not load the passage (${response.status}).`;
      return { status: "error", message };
    }

    const context = parseChunkContext(payload);

    return context
      ? { status: "ready", context }
      : {
          status: "error",
          message: "The passage came back in an unexpected shape.",
        };
  } catch {
    return {
      status: "error",
      message: "Could not reach the server. Check your connection.",
    };
  }
}

/** The current chunk with the key quote wrapped in <mark>. */
export function HighlightedPassage({
  text,
  quote,
}: {
  text: string;
  quote?: string;
}) {
  const range = quote ? locateQuote(text, quote) : null;

  if (!range) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, range.start)}
      <mark className="rounded-[3px] bg-white/[0.16] px-0.5 text-white [box-decoration-break:clone]">
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  );
}

/**
 * Digest of one cited passage: AI gist, verified key quote, and an
 * on-demand view of the full chunk with its neighbours. The jump note
 * ("why it follows") is rendered by the caller above this card.
 */
export function TrailStepCard({
  note,
  size = "sm",
  citationIndex,
  onOpenCitation,
}: {
  note: Note;
  size?: "sm" | "md";
  citationIndex?: number;
  onOpenCitation?: (note: Note) => void;
}) {
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState<ContextState>({ status: "idle" });
  const chunkId = chunkIdOf(note);

  const load = async () => {
    if (chunkId === null) {
      return;
    }

    setContext({ status: "loading" });
    setContext(await fetchContext(chunkId));
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);

    // Fetch lazily, once per mount; later toggles reuse the cached result.
    if (next && context.status === "idle") {
      void load();
    }
  };

  const body = size === "md" ? "text-[15.5px] leading-7" : "text-[14.5px] leading-6";
  const quoteText = size === "md" ? "text-[15px] leading-6" : "text-[14.5px] leading-6";

  return (
    <div className="mt-4 space-y-4">
      {note.gist ? (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            AI summary
          </p>
          <p className={`mt-1 text-neutral-300 ${body}`}>{note.gist}</p>
        </div>
      ) : null}

      {note.quote ? (
        <figure>
          <blockquote
            className={`border-l-2 border-white/20 pl-3 italic text-neutral-200 ${quoteText}`}
          >
            {note.quote}
          </blockquote>
          <figcaption className="mt-1.5 flex flex-wrap items-center gap-2 pl-3 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
            <span>{note.tag}</span>
            <ProvenancePill provenance={originProvenance(note.sourceOrigin)} />
          </figcaption>
        </figure>
      ) : note.gist ? (
        <p className={`text-neutral-400 ${quoteText}`}>{preview(note.body)}</p>
      ) : (
        <p className={`text-neutral-400 ${body}`}>{note.excerpt}</p>
      )}

      {onOpenCitation ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenCitation(note)}
            aria-label={`Open source for ${note.title}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 -ml-1.5 font-mono text-[12px] text-neutral-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <span className="rounded border border-white/15 px-1 py-0.5 text-[11.5px] text-neutral-300">
              {citationIndex ?? 1}
            </span>
            {note.sourceOrigin === "web"
              ? `Source · ${note.sourceDomain ?? "web"}`
              : "View source"}
          </button>
        </div>
      ) : null}

      {chunkId !== null ? (
        <div>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 -ml-1.5 text-[13px] text-neutral-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <ChevronRightIcon
              className={`size-3.5 transition-transform duration-200 ${
                expanded ? "rotate-90" : ""
              }`}
            />
            {expanded ? "Hide full passage" : "Show full passage"}
          </button>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                id={panelId}
                key="passage"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                aria-busy={context.status === "loading"}
                className="mt-2 rounded-xl border border-white/[0.07] bg-black/20 p-3.5"
              >
                {context.status === "loading" || context.status === "idle" ? (
                  <p className="flex items-center gap-2 text-[13px] text-neutral-400">
                    <Spinner />
                    Loading the passage…
                  </p>
                ) : context.status === "error" ? (
                  <p role="alert" className="text-[13px] leading-5 text-neutral-300">
                    {context.message}{" "}
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="rounded font-medium text-white underline decoration-white/30 underline-offset-[3px] hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    >
                      Retry
                    </button>
                  </p>
                ) : (
                  <div className={`space-y-3 whitespace-pre-line ${quoteText}`}>
                    {context.context.previous ? (
                      <section aria-label="Earlier in the document">
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                          Earlier · p.{context.context.previous.page}
                        </p>
                        <p className="mt-1 text-neutral-500">
                          {context.context.previous.content}
                        </p>
                      </section>
                    ) : null}

                    <section aria-label="Cited passage">
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                        This passage · p.{context.context.current.page}
                      </p>
                      <p className="mt-1 text-neutral-200">
                        <HighlightedPassage
                          text={context.context.current.content}
                          quote={note.quote}
                        />
                      </p>
                    </section>

                    {context.context.next ? (
                      <section aria-label="Later in the document">
                        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                          Later · p.{context.context.next.page}
                        </p>
                        <p className="mt-1 text-neutral-500">
                          {context.context.next.content}
                        </p>
                      </section>
                    ) : null}
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
