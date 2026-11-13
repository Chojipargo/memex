"use client";

import { type FormEvent, useId, useState } from "react";

import { SearchIcon } from "@/components/ui/dashboard-icons";
import { Spinner } from "@/components/ui/spinner";
import {
  type PassageSearchResult,
  parsePassageSearchResults,
} from "@/lib/links/types";
import { readApiError } from "@/lib/trails/api";

/** Search the library and pick one passage. */
export function PassagePicker({
  excludeChunkIds,
  placeholder = "Find a passage…",
  onPick,
  onCancel,
}: {
  excludeChunkIds: ReadonlySet<number>;
  placeholder?: string;
  onPick: (result: PassageSearchResult) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PassageSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();

    if (q.length < 3) {
      setError("Search with at least 3 characters.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/chunks/search?q=${encodeURIComponent(q)}`);
      const body = (await response.json().catch(() => null)) as { results?: unknown } | null;

      if (!response.ok) {
        setError(readApiError(body) ?? "Search failed. Try again.");
        return;
      }

      setResults(
        (parsePassageSearchResults(body?.results) ?? []).filter(
          (result) => !excludeChunkIds.has(result.chunkId),
        ),
      );
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <label className="sr-only" htmlFor={inputId}>
          {placeholder}
        </label>
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          autoFocus
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-[13.5px] text-neutral-100 placeholder:text-neutral-500 focus:border-white/25 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label="Search passages"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.05] text-neutral-300 transition hover:text-white disabled:opacity-50"
        >
          {busy ? <Spinner className="size-3.5" /> : <SearchIcon className="size-4" />}
        </button>
      </form>
      {results ? (
        results.length === 0 ? (
          <p className="mt-2.5 text-[13px] text-neutral-500">No matching passages.</p>
        ) : (
          <ul className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto">
            {results.map((result) => (
              <li key={result.chunkId}>
                <button
                  type="button"
                  onClick={() => onPick(result)}
                  className="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <span className="block truncate text-[13px] font-medium text-neutral-200">
                    {result.documentTitle}{" "}
                    <span className="text-neutral-500">· p.{result.page}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-5 text-neutral-500">
                    {result.excerpt}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-neutral-300">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 text-[12.5px] text-neutral-500 transition hover:text-neutral-300"
      >
        Cancel
      </button>
    </div>
  );
}
