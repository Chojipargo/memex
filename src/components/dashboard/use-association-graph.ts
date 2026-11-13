"use client";

import { useEffect, useState } from "react";

import type { Association } from "@/lib/dashboard/data";
import { type AssociationGraph, parseAssociationGraph } from "@/lib/graph/types";

/**
 * Load the reader's usage-weighted association map. It is fetched again
 * whenever `refreshKey` changes (for example after a trail is built, edited,
 * or walked), and keeps showing the previous map while reloading.
 */
export function useAssociationGraph(refreshKey: string, enabled: boolean) {
  const [graph, setGraph] = useState<AssociationGraph | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/graph", { signal: controller.signal });

        if (!response.ok) {
          return;
        }

        const parsed = parseAssociationGraph(await response.json().catch(() => null));

        if (parsed && !controller.signal.aborted) {
          setGraph(parsed);
        }
      } catch {
        // The map is a view of data saved elsewhere; keep the last one.
      }
    })();

    return () => controller.abort();
  }, [enabled, refreshKey]);

  return graph;
}

/** The graph's edges as note-to-note associations ("chunk-<id>" note ids), strongest first. */
export function graphAssociations(graph: AssociationGraph | null): Association[] {
  if (!graph || graph.edges.length === 0) {
    return [];
  }

  const max = Math.max(...graph.edges.map((edge) => edge.weight));

  return graph.edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    fromId: `chunk-${edge.source}`,
    toId: `chunk-${edge.target}`,
    strength: Math.max(1, Math.round((edge.weight / max) * 100)),
    hint:
      edge.reason ??
      (edge.cooccurrence > 0
        ? "These passages appear near each other on your trails."
        : "Linked passages."),
  }));
}
