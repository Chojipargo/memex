/**
 * Reading Gemini's rate-limit responses.
 *
 * A 429 from the Gemini API carries a google.rpc.RetryInfo detail with a
 * `retryDelay` like "17s", and a google.rpc.QuotaFailure detail naming the
 * quota that ran out (for example a `...PerDay...` or `...PerMinute...`
 * quota id). Following the delay, instead of retrying after half a second,
 * is what actually gets a request through a per-minute limit; recognising a
 * daily limit lets us stop retrying and say so.
 */

export type RateLimitInfo = {
  /** How long Google asks us to wait, if it said. */
  retryAfterMs: number | null;
  /** True when the exhausted quota is a daily one, which retrying won't fix. */
  daily: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse a protobuf Duration string ("17s", "0.5s") into milliseconds. */
export function parseDurationMs(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^\s*(\d+(?:\.\d+)?)s\s*$/.exec(value);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

/** Parse a Retry-After header given in seconds. */
export function parseRetryAfterHeader(value: string | null | undefined): number | null {
  if (!value || !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) {
    return null;
  }

  return Math.round(Number(value) * 1000);
}

export function readRateLimitInfo(
  payload: unknown,
  retryAfterHeader?: string | null,
): RateLimitInfo {
  const error = asRecord(asRecord(payload)?.error);
  const details = Array.isArray(error?.details) ? error.details : [];
  let retryAfterMs = parseRetryAfterHeader(retryAfterHeader);
  let daily = false;

  for (const raw of details) {
    const detail = asRecord(raw);
    const type = typeof detail?.["@type"] === "string" ? detail["@type"] : "";

    if (type.endsWith("google.rpc.RetryInfo")) {
      retryAfterMs = parseDurationMs(detail?.retryDelay) ?? retryAfterMs;
    }

    if (type.endsWith("google.rpc.QuotaFailure") && Array.isArray(detail?.violations)) {
      for (const violation of detail.violations) {
        const quotaId = asRecord(violation)?.quotaId;

        if (typeof quotaId === "string" && /per ?day/i.test(quotaId)) {
          daily = true;
        }
      }
    }
  }

  const message = typeof error?.message === "string" ? error.message : "";

  if (!daily && /per ?day|daily/i.test(message)) {
    daily = true;
  }

  return { retryAfterMs, daily };
}

/**
 * How long to wait before the next attempt: Google's delay when it gave one,
 * otherwise exponential backoff with jitter. `random` is injectable for tests.
 */
export function retryDelayMs(
  attempt: number,
  info: RateLimitInfo | null,
  random: () => number = Math.random,
): number {
  if (info?.retryAfterMs !== null && info?.retryAfterMs !== undefined) {
    // A little extra so we land just after the window resets, not on it.
    return info.retryAfterMs + 250;
  }

  const base = (info ? 1000 : 500) * 2 ** (attempt - 1);
  return Math.round(base * (0.75 + random() * 0.5));
}
