"use client";

import { useEffect } from "react";

/**
 * Count this reader toward the trail's popularity. The server ignores
 * signed-out visitors, the author, and repeat visits, so a failure here is
 * harmless and silently skipped.
 */
export function RecordLearner({ publishedId }: { publishedId: string }) {
  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/explore/${publishedId}/learn`, {
      method: "POST",
      signal: controller.signal,
    }).catch(() => undefined);

    return () => controller.abort();
  }, [publishedId]);

  return null;
}
