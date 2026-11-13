"use client";

import { type FormEvent, useCallback, useState } from "react";

import { PassagePicker } from "@/components/dashboard/passage-picker";
import {
  ArrowRightIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import type { TrailNode } from "@/lib/dashboard/data";
import { LINK_REASON_MAX_CHARS } from "@/lib/links/types";
import { parseTrailApiResponse, readApiError, type TrailApi } from "@/lib/trails/api";
import {
  ANNOTATION_MAX_CHARS,
  parseRewritePairs,
  type RewritePair,
  type RewriteStepInput,
} from "@/lib/trails/edit-types";

/** Chunk id behind a generated trail node ("chunk-<id>"), or null. */
export function nodeChunkId(node: Pick<TrailNode, "noteId">): number | null {
  const match = /^chunk-(\d+)$/.exec(node.noteId);
  return match ? Number(match[1]) : null;
}

type ReviewRow = RewritePair & { draft: string };

type RewriteState =
  | { kind: "idle" }
  | { kind: "previewing"; label: string }
  | {
      kind: "review";
      label: string;
      order: number[];
      focusIndex: number;
      rows: ReviewRow[];
      suggestionError: string | null;
    }
  | { kind: "saving"; label: string };

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

/**
 * Insert, drop, and reorder for one trail. Each edit is previewed first so the
 * reader can review the reason for every new connection (an existing link's,
 * or Claude's suggestion) before it is saved.
 */
export function useTrailRewrite({
  apiTrailId,
  chunkIds,
  onSaved,
}: {
  apiTrailId: string;
  /** Current order, as the reader sees it. */
  chunkIds: number[];
  onSaved: (trail: TrailApi, focusIndex: number) => void;
}) {
  const [state, setState] = useState<RewriteState>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (
      order: number[],
      focusIndex: number,
      label: string,
      reasons: Map<number, { reason: string; origin: "user" | "claude_accepted" }>,
    ) => {
      setState({ kind: "saving", label });
      setError(null);

      const steps: RewriteStepInput[] = order.map((chunkId, index) => {
        const reason = reasons.get(index + 1);
        return reason
          ? { chunkId, reason: reason.reason, reasonOrigin: reason.origin }
          : { chunkId };
      });

      try {
        const response = await fetch(`/api/trails/${apiTrailId}/rewrite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedChunkIds: chunkIds, steps }),
        });
        const body = await readJson(response);
        const trail = response.ok ? parseTrailApiResponse(body) : null;

        if (!trail) {
          setError(readApiError(body) ?? "Could not save this edit.");
          setState({ kind: "idle" });
          return;
        }

        setState({ kind: "idle" });
        onSaved(trail, focusIndex);
      } catch {
        setError("Could not reach the server. Try again.");
        setState({ kind: "idle" });
      }
    },
    [apiTrailId, chunkIds, onSaved],
  );

  /** Start an edit: preview the new order, then review or save straight away. */
  const propose = useCallback(
    async (order: number[], focusIndex: number, label: string) => {
      setState({ kind: "previewing", label });
      setError(null);

      try {
        const response = await fetch(`/api/trails/${apiTrailId}/rewrite/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunkIds: order }),
        });
        const body = (await readJson(response)) as {
          pairs?: unknown;
          suggestionError?: unknown;
        } | null;
        const pairs = response.ok ? parseRewritePairs(body?.pairs) : null;

        if (!pairs) {
          setError(readApiError(body) ?? "Could not prepare this edit.");
          setState({ kind: "idle" });
          return;
        }

        // Nothing new to connect (e.g. dropping the last step): just save.
        if (pairs.length === 0) {
          await save(order, focusIndex, label, new Map());
          return;
        }

        setState({
          kind: "review",
          label,
          order,
          focusIndex,
          rows: pairs.map((pair) => ({ ...pair, draft: pair.reason })),
          suggestionError:
            typeof body?.suggestionError === "string" ? body.suggestionError : null,
        });
      } catch {
        setError("Could not reach the server. Try again.");
        setState({ kind: "idle" });
      }
    },
    [apiTrailId, save],
  );

  const updateDraft = (position: number, draft: string) => {
    setState((current) =>
      current.kind === "review"
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.position === position ? { ...row, draft } : row,
            ),
          }
        : current,
    );
  };

  const confirm = () => {
    if (state.kind !== "review") {
      return;
    }

    const reasons = new Map<number, { reason: string; origin: "user" | "claude_accepted" }>();

    for (const row of state.rows) {
      const draft = row.draft.trim();

      if (draft) {
        reasons.set(row.position, {
          reason: draft,
          // Keeping Claude's words unchanged accepts its link; anything else is yours.
          origin: row.suggested && draft === row.reason.trim() ? "claude_accepted" : "user",
        });
      }
    }

    void save(state.order, state.focusIndex, state.label, reasons);
  };

  return {
    state,
    error,
    busy: state.kind !== "idle" && state.kind !== "review",
    propose,
    updateDraft,
    confirm,
    cancel: () => setState({ kind: "idle" }),
    clearError: () => setError(null),
  };
}

export type TrailRewrite = ReturnType<typeof useTrailRewrite>;

/** Review panel for the new connections an edit creates. */
export function RewriteReview({ rewrite }: { rewrite: TrailRewrite }) {
  const { state } = rewrite;

  if (state.kind === "previewing" || state.kind === "saving") {
    return (
      <div
        role="status"
        className="mb-4 flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3.5 py-3 text-[13.5px] text-neutral-300"
      >
        <Spinner className="size-3.5" />
        {state.kind === "previewing"
          ? `${state.label}: checking the new connections…`
          : `${state.label}: saving…`}
      </div>
    );
  }

  if (state.kind !== "review") {
    return rewrite.error ? (
      <div
        role="alert"
        className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-3 text-[13.5px] text-neutral-200"
      >
        <span>{rewrite.error}</span>
        <button
          type="button"
          onClick={rewrite.clearError}
          aria-label="Dismiss"
          className="text-neutral-400 hover:text-white"
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>
    ) : null;
  }

  const missing = state.rows.some((row) => !row.draft.trim());

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        rewrite.confirm();
      }}
      className="mb-4 rounded-2xl border border-white/[0.14] bg-white/[0.045] p-4"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400">
        {state.label}
      </p>
      <p className="mt-1.5 text-[14px] leading-6 text-neutral-200">
        {state.rows.length === 1 ? "This edit makes a new connection." : `This edit makes ${state.rows.length} new connections.`}{" "}
        Check why each step follows the one before it.
      </p>
      {state.suggestionError ? (
        <p className="mt-2 text-[13px] text-neutral-400">{state.suggestionError}</p>
      ) : null}

      <ol className="mt-3 space-y-3">
        {state.rows.map((row) => (
          <li key={row.position}>
            <label
              htmlFor={`reason-${row.position}`}
              className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-neutral-400"
            >
              <span className="truncate text-neutral-300">{row.sourceTitle}</span>
              <ArrowRightIcon className="size-3 shrink-0" />
              <span className="truncate text-neutral-300">{row.targetTitle}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-neutral-500">
                step {row.position} ·{" "}
                {row.existingLinkId ? "existing link" : row.suggested ? "suggested by Claude" : "needs a reason"}
              </span>
            </label>
            <textarea
              id={`reason-${row.position}`}
              value={row.draft}
              onChange={(event) => rewrite.updateDraft(row.position, event.target.value)}
              maxLength={LINK_REASON_MAX_CHARS}
              rows={2}
              placeholder="Why does this step follow the one before it?"
              className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[13.5px] leading-5 text-neutral-100 placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
            />
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={missing}
          className="rounded-xl bg-white px-3.5 py-2 text-[13.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
        >
          Apply edit
        </button>
        <button
          type="button"
          onClick={rewrite.cancel}
          className="rounded-xl px-3 py-2 text-[13.5px] text-neutral-400 transition hover:text-white"
        >
          Cancel
        </button>
        {missing ? (
          <span className="text-[12.5px] text-neutral-500">Every new connection needs a reason.</span>
        ) : null}
      </div>
    </form>
  );
}

/** "+ Insert a passage here" between steps (or at the end). */
export function InsertSlot({
  index,
  chunkIds,
  disabled,
  onInsert,
}: {
  /** Index the new passage will take in the trail. */
  index: number;
  chunkIds: number[];
  disabled: boolean;
  onInsert: (order: number[], index: number) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="ml-11 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-neutral-500 transition hover:bg-white/[0.04] hover:text-neutral-200 disabled:opacity-40"
      >
        <PlusIcon className="size-3.5" />
        Insert a passage {index === chunkIds.length ? "at the end" : "here"}
      </button>
    );
  }

  return (
    <div className="ml-11 rounded-2xl border border-white/[0.1] bg-white/[0.025] p-3.5">
      <PassagePicker
        excludeChunkIds={new Set(chunkIds)}
        placeholder="Find a passage to insert…"
        onPick={(result) => {
          setOpen(false);
          const order = [...chunkIds];
          order.splice(index, 0, result.chunkId);
          onInsert(order, index);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

/** The reader's own note on a step: shown always, editable in edit mode. */
export function StepAnnotation({
  apiTrailId,
  position,
  annotation,
  editing,
  onSaved,
}: {
  apiTrailId: string;
  position: number;
  annotation: string | undefined;
  editing: boolean;
  onSaved: (annotation: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(annotation ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/trails/${apiTrailId}/steps/${position}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotation: draft.trim() || null }),
      });
      const body = (await readJson(response)) as { annotation?: unknown } | null;

      if (!response.ok) {
        setError(readApiError(body) ?? "Could not save this note.");
        return;
      }

      onSaved(typeof body?.annotation === "string" ? body.annotation : null);
      setOpen(false);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (open) {
    return (
      <form onSubmit={save} className="mt-3">
        <label
          htmlFor={`annotation-${position}`}
          className="text-[12px] font-medium uppercase tracking-[0.14em] text-neutral-400"
        >
          Your note on this step
        </label>
        <textarea
          id={`annotation-${position}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={ANNOTATION_MAX_CHARS}
          rows={3}
          autoFocus
          className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[14px] leading-6 text-neutral-100 focus:border-white/25 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save note"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(annotation ?? "");
              setOpen(false);
            }}
            className="rounded-lg px-2.5 py-1.5 text-[13px] text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-1.5 text-[12.5px] text-neutral-300">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <>
      {annotation ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/[0.12] px-3 py-2">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            Your note
          </p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-neutral-300">
            {annotation}
          </p>
        </div>
      ) : null}
      {editing ? (
        <button
          type="button"
          onClick={() => {
            setDraft(annotation ?? "");
            setOpen(true);
          }}
          className="mt-2 text-[12.5px] text-neutral-400 underline decoration-white/15 underline-offset-4 transition hover:text-white"
        >
          {annotation ? "Edit your note" : "Add a note to this step"}
        </button>
      ) : null}
    </>
  );
}
