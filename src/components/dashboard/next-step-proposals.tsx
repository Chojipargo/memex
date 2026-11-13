"use client";

import { useState } from "react";

import {
  originProvenance,
  ProvenancePill,
} from "@/components/dashboard/provenance-pill";
import { ArrowRightIcon, CloseIcon, LinkIcon } from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import { LINK_REASON_MAX_CHARS } from "@/lib/links/types";
import { parseTrailApiResponse, readApiError, type TrailApi } from "@/lib/trails/api";
import { type NextStepProposal, parseProposals } from "@/lib/trails/proposal-types";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; fromChunkId: number; proposals: NextStepProposal[] };

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

/**
 * "Suggest next steps": Claude proposes passages to go to from where the
 * trail ends, each with the reason for its link. Picking one continues the
 * trail with it; the others are discarded, never saved.
 */
export function NextStepProposals({
  apiTrailId,
  question,
  disabled,
  onContinued,
}: {
  apiTrailId: string;
  /** What the reader typed in the follow-up box, if anything. */
  question: string;
  disabled: boolean;
  onContinued: (trail: TrailApi) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [accepting, setAccepting] = useState(false);

  const suggest = async () => {
    setState({ kind: "loading" });
    setError(null);
    setSelected(null);

    try {
      const response = await fetch(`/api/trails/${apiTrailId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const body = (await readJson(response)) as {
        proposals?: unknown;
        fromChunkId?: unknown;
      } | null;
      const proposals = response.ok ? parseProposals(body?.proposals) : null;

      if (!proposals || typeof body?.fromChunkId !== "number") {
        setError(readApiError(body) ?? "Could not suggest next steps. Try again.");
        setState({ kind: "idle" });
        return;
      }

      setState({ kind: "ready", fromChunkId: body.fromChunkId, proposals });
    } catch {
      setError("Could not reach the server. Try again.");
      setState({ kind: "idle" });
    }
  };

  const accept = async (proposal: NextStepProposal, fromChunkId: number) => {
    const reason = draft.trim();
    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/trails/${apiTrailId}/proposals/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChunkId,
          chunkId: proposal.chunkId,
          reason,
          reasonEdited: reason !== proposal.reason.trim(),
          gist: proposal.gist,
          quote: proposal.quote,
        }),
      });
      const body = await readJson(response);
      const trail = response.ok ? parseTrailApiResponse(body) : null;

      if (!trail) {
        setError(readApiError(body) ?? "Could not add this step.");
        return;
      }

      setState({ kind: "idle" });
      setSelected(null);
      onContinued(trail);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="mt-3">
      {state.kind !== "ready" ? (
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={disabled || state.kind === "loading"}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {state.kind === "loading" ? <Spinner className="size-3.5" /> : <LinkIcon className="size-3.5" />}
          {state.kind === "loading"
            ? "Finding where to go next…"
            : question.trim().length >= 3
              ? "Suggest next steps for this question"
              : "Suggest next steps"}
        </button>
      ) : (
        <div className="rounded-xl border border-white/[0.1] bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              Where to go next
            </p>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              aria-label="Dismiss suggestions"
              className="text-neutral-500 transition hover:text-white"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {state.proposals.map((proposal) => {
              const isSelected = selected === proposal.chunkId;

              return (
                <li
                  key={proposal.chunkId}
                  className={`rounded-xl border p-3 transition ${
                    isSelected
                      ? "border-white/25 bg-white/[0.06]"
                      : "border-white/[0.07] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-neutral-100">
                      {proposal.documentTitle}
                    </span>
                    <span className="text-[12px] text-neutral-500">p.{proposal.page}</span>
                    <ProvenancePill provenance={originProvenance(proposal.sourceOrigin)} />
                  </div>

                  {isSelected ? (
                    <div className="mt-2">
                      <label
                        htmlFor={`proposal-reason-${proposal.chunkId}`}
                        className="text-[12px] font-medium uppercase tracking-[0.14em] text-neutral-400"
                      >
                        Why it follows
                        <span className="ml-1.5 normal-case tracking-normal text-neutral-500">
                          ({proposal.existingLink ? "existing link" : "suggested by Claude"}, edit if you like)
                        </span>
                      </label>
                      <textarea
                        id={`proposal-reason-${proposal.chunkId}`}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        maxLength={LINK_REASON_MAX_CHARS}
                        rows={2}
                        autoFocus
                        className="mt-1.5 w-full resize-y rounded-lg border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[13.5px] leading-5 text-neutral-100 focus:border-white/25 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[13.5px] leading-5 text-neutral-200">{proposal.reason}</p>
                  )}

                  {proposal.gist ? (
                    <p className="mt-1.5 text-[12.5px] leading-5 text-neutral-400">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-neutral-500">
                        AI summary ·{" "}
                      </span>
                      {proposal.gist}
                    </p>
                  ) : (
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-neutral-500">
                      {proposal.excerpt}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center gap-2">
                    {isSelected ? (
                      <>
                        <button
                          type="button"
                          disabled={accepting || !draft.trim()}
                          onClick={() => void accept(proposal, state.fromChunkId)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
                        >
                          {accepting ? <Spinner className="size-3" /> : null}
                          Continue with this
                          <ArrowRightIcon className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelected(null)}
                          className="rounded-lg px-2.5 py-1.5 text-[13px] text-neutral-400 hover:text-white"
                        >
                          Back
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelected(proposal.chunkId);
                          setDraft(proposal.reason);
                        }}
                        className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[13px] font-medium text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                      >
                        Go here next
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-neutral-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
