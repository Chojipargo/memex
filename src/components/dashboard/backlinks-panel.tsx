"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { PassagePicker } from "@/components/dashboard/passage-picker";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  LinkIcon,
  PlusIcon,
  TrailsIcon,
} from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import {
  LINK_REASON_MAX_CHARS,
  type LinkedPassage,
  type PassageBacklinks,
  type PassageSearchResult,
  parsePassageBacklinks,
} from "@/lib/links/types";
import { recordLinkTraversal } from "@/lib/links/traversal";
import { readApiError } from "@/lib/trails/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; backlinks: PassageBacklinks }
  | { kind: "error"; message: string };

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function flatten(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * "Tied to these passages / Also on these trails" for one passage, with a
 * quick action to link it to another passage by hand.
 */
export function BacklinksPanel({
  chunkId,
  onOpenPassage,
  onOpenTrailAt,
}: {
  chunkId: number;
  /** Open a linked passage; the link has already been counted as followed. */
  onOpenPassage: (passage: LinkedPassage) => void;
  /** Jump into a trail at this passage's 1-based position. */
  onOpenTrailAt: (trailId: string, position: number) => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    // Keyed by chunk id, so a new passage remounts in the loading state.
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/chunks/${chunkId}/backlinks`, {
          signal: controller.signal,
        });
        const body = await readJson(response);

        if (!response.ok) {
          setState({
            kind: "error",
            message: readApiError(body) ?? "Could not load what this passage is tied to.",
          });
          return;
        }

        const backlinks = parsePassageBacklinks(body);
        setState(
          backlinks
            ? { kind: "ready", backlinks }
            : { kind: "error", message: "The link service returned an unexpected response." },
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "Could not reach the server.",
          });
        }
      }
    })();

    return () => controller.abort();
  }, [chunkId, reloadKey]);

  const follow = (linkId: string, passage: LinkedPassage) => {
    // Strengthen the link; opening the passage doesn't wait on it.
    recordLinkTraversal(linkId);
    onOpenPassage(passage);
  };

  const onLinked = useCallback(() => {
    setLinking(false);
    setState({ kind: "loading" });
    setReloadKey((key) => key + 1);
  }, []);

  return (
    <section aria-labelledby={`backlinks-${chunkId}`} className="mt-6 border-t border-white/[0.07] pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3
          id={`backlinks-${chunkId}`}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400"
        >
          Also on these trails / Tied to these passages
        </h3>
        {!linking ? (
          <button
            type="button"
            onClick={() => setLinking(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <PlusIcon className="size-3.5" />
            Link a passage
          </button>
        ) : null}
      </div>

      {linking ? (
        <LinkComposer
          sourceChunkId={chunkId}
          onCancel={() => setLinking(false)}
          onLinked={onLinked}
        />
      ) : null}

      {state.kind === "loading" ? (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-neutral-500">
          <Spinner className="size-3.5" />
          Loading connections…
        </div>
      ) : state.kind === "error" ? (
        <p className="mt-4 text-[13px] text-neutral-400">{state.message}</p>
      ) : (
        <>
          <div className="mt-4">
            <p className="text-[12.5px] font-medium text-neutral-300">Tied to these passages</p>
            {state.backlinks.links.length === 0 ? (
              <p className="mt-1.5 text-[13px] text-neutral-500">
                No links yet. Link this passage to another to start a connection.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {state.backlinks.links.map((link) => {
                  const DirectionIcon =
                    link.direction === "outgoing" ? ArrowRightIcon : ArrowLeftIcon;

                  return (
                    <li key={link.linkId}>
                      <button
                        type="button"
                        onClick={() => follow(link.linkId, link.passage)}
                        className="group w-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition hover:border-white/[0.15] hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                          <DirectionIcon
                            className="size-3 shrink-0"
                            aria-label={link.direction === "outgoing" ? "Leads to" : "Comes from"}
                          />
                          <span className="truncate font-medium text-neutral-300 group-hover:text-white">
                            {link.passage.documentTitle}
                          </span>
                          <span className="shrink-0">p.{link.passage.page}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em]">
                            {link.origin === "user" ? "yours" : "claude"}
                            {link.traversalCount > 0 ? ` · ${link.traversalCount}×` : ""}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-5 text-neutral-200">{link.reason}</p>
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-neutral-500">
                          {flatten(link.passage.content)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-5">
            <p className="text-[12.5px] font-medium text-neutral-300">Also on these trails</p>
            {state.backlinks.trails.length === 0 ? (
              <p className="mt-1.5 text-[13px] text-neutral-500">
                This passage isn&apos;t on any trail yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {state.backlinks.trails.map((trail) => (
                  <li key={`${trail.trailId}-${trail.position}`}>
                    <button
                      type="button"
                      onClick={() => onOpenTrailAt(trail.trailId, trail.position)}
                      className="group w-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition hover:border-white/[0.15] hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    >
                      <div className="flex items-center gap-2">
                        <TrailsIcon className="size-3.5 shrink-0 text-neutral-500" />
                        <span className="truncate text-[13px] font-medium text-neutral-200 group-hover:text-white">
                          {trail.title}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-neutral-500">
                          step {trail.position} of {trail.stepCount}
                        </span>
                      </div>
                      {trail.annotation ? (
                        <p className="mt-1.5 text-[12.5px] italic leading-5 text-neutral-400">
                          {trail.annotation}
                        </p>
                      ) : null}
                      <div className="mt-1.5 space-y-1 text-[12px] leading-5 text-neutral-500">
                        {trail.previous ? (
                          <p className="line-clamp-1">
                            <span className="text-neutral-400">Before: </span>
                            {trail.previous.documentTitle} · {flatten(trail.previous.excerpt, 90)}
                          </p>
                        ) : null}
                        {trail.next ? (
                          <p className="line-clamp-1">
                            <span className="text-neutral-400">After: </span>
                            {trail.next.documentTitle} · {flatten(trail.next.excerpt, 90)}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Search the library for a passage, say why it connects, and save the link. */
function LinkComposer({
  sourceChunkId,
  onCancel,
  onLinked,
}: {
  sourceChunkId: number;
  onCancel: () => void;
  onLinked: () => void;
}) {
  const [target, setTarget] = useState<PassageSearchResult | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!target) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceChunkId,
          targetChunkId: target.chunkId,
          reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        setError(readApiError(await readJson(response)) ?? "Could not save this link.");
        return;
      }

      onLinked();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-white/[0.1] bg-white/[0.025] p-3.5">
      {target ? (
        <form onSubmit={save}>
          <p className="flex items-center gap-1.5 text-[12.5px] text-neutral-400">
            <LinkIcon className="size-3.5" />
            Linking to <span className="font-medium text-neutral-200">{target.documentTitle}</span>
            <span>p.{target.page}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-neutral-500">{target.excerpt}</p>
          <label className="mt-3 block text-[12.5px] font-medium text-neutral-300" htmlFor={`reason-${sourceChunkId}`}>
            Why do these connect?
          </label>
          <textarea
            id={`reason-${sourceChunkId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={LINK_REASON_MAX_CHARS}
            rows={3}
            required
            autoFocus
            className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[13.5px] text-neutral-100 placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
            placeholder="Both describe…"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save link"}
            </button>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="rounded-xl px-3 py-2 text-[13px] text-neutral-400 transition hover:text-white"
            >
              Choose another
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-[12.5px] text-neutral-300">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <PassagePicker
          excludeChunkIds={new Set([sourceChunkId])}
          placeholder="Find a passage to link…"
          onPick={setTarget}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
