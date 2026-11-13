"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ArrowUpRightIcon, GlobeIcon } from "@/components/ui/dashboard-icons";
import {
  parseTrailPublication,
  publishedTrailPath,
  type TrailPublication,
} from "@/lib/explore/types";

type State =
  | { kind: "loading" }
  | { kind: "ready"; publication: TrailPublication | null }
  | { kind: "unavailable" };

async function request(
  apiTrailId: string,
  method: "GET" | "POST" | "DELETE",
): Promise<{ ok: true; publication: TrailPublication | null } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/trails/${apiTrailId}/publish`, { method });
    const body = (await response.json().catch(() => null)) as {
      publication?: unknown;
      error?: unknown;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        message:
          typeof body?.error === "string" ? body.error : "Could not update sharing. Try again.",
      };
    }

    return { ok: true, publication: parseTrailPublication(body?.publication ?? null) };
  } catch {
    return { ok: false, message: "Could not reach the server. Try again." };
  }
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-[13.5px] font-medium text-neutral-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50";

/** Publish a generated trail to Explore, refresh its public copy, or take it down. */
export function ShareTrail({
  apiTrailId,
  stepCount,
}: {
  apiTrailId: string;
  stepCount: number;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void request(apiTrailId, "GET").then((result) => {
      if (!cancelled) {
        setState(
          result.ok
            ? { kind: "ready", publication: result.publication }
            : { kind: "unavailable" },
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [apiTrailId]);

  if (state.kind !== "ready") {
    return null;
  }

  const publication = state.publication;
  const outdated = publication !== null && publication.stepCount !== stepCount;

  const run = async (method: "POST" | "DELETE", success: string) => {
    setBusy(true);
    setMessage(null);
    const result = await request(apiTrailId, method);
    setBusy(false);
    setConfirming(false);

    if (result.ok) {
      setState({ kind: "ready", publication: result.publication });
      setMessage(success);
    } else {
      setMessage(result.message);
    }
  };

  if (confirming) {
    return (
      <div className="w-full rounded-xl border border-white/[0.1] bg-white/[0.035] p-3.5 text-[13.5px] leading-5 text-neutral-300">
        <p>
          Anyone can see this trail on Explore: its title, question, and each
          step&apos;s note, AI summary, key quote, and source title. The full
          text of your uploads and notes stays private.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("POST", "Shared on Explore.")}
            className="rounded-xl bg-white px-3.5 py-2 text-[13.5px] font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {busy ? "Sharing…" : "Share publicly"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className={buttonClass}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!publication) {
    return (
      <>
        <button type="button" onClick={() => setConfirming(true)} className={buttonClass}>
          <GlobeIcon className="size-3.5" />
          Share on Explore
        </button>
        {message ? (
          <span role="status" className="text-[12.5px] text-neutral-400">
            {message}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Link
        href={publishedTrailPath(publication.publishedId)}
        target="_blank"
        className={buttonClass}
        title={`${publication.learnerCount} learner${publication.learnerCount === 1 ? "" : "s"}`}
      >
        <GlobeIcon className="size-3.5" />
        Public · {publication.learnerCount}
        <ArrowUpRightIcon className="size-3" />
      </Link>
      {outdated ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("POST", "Public copy updated.")}
          className={buttonClass}
        >
          Update public copy
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("DELETE", "Removed from Explore.")}
        className={buttonClass}
      >
        Unpublish
      </button>
      {message ? (
        <span role="status" className="text-[12.5px] text-neutral-400">
          {message}
        </span>
      ) : null}
    </>
  );
}
