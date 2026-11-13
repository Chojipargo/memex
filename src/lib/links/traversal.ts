/**
 * Record that the reader followed a link (in the passage reader, or by
 * stepping along a trail). Repeats of the same link within a short window
 * count once, so flicking back and forth doesn't inflate a path's weight.
 * Failures are ignored: traversal counts are a signal, not a record.
 */

const REPEAT_WINDOW_MS = 60_000;
const lastRecorded = new Map<string, number>();

export function recordLinkTraversal(linkId: string | null | undefined): void {
  if (!linkId || typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  const previous = lastRecorded.get(linkId);

  if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) {
    return;
  }

  lastRecorded.set(linkId, now);
  void fetch(`/api/links/${encodeURIComponent(linkId)}/traverse`, {
    method: "POST",
    keepalive: true,
  }).catch(() => undefined);
}
