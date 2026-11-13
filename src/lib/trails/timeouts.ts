/**
 * Time budgets for the trail API.
 *
 * The route handlers export `maxDuration = 60`, so every provider call has to
 * finish well inside that window and surface a typed error (which the routes
 * turn into a JSON response) instead of being killed by the platform.
 */

/** Keep in sync with the literal `maxDuration` in the trail route handlers. */
export const TRAIL_MAX_DURATION_SECONDS = 60;

/**
 * Total wall-clock budget for one generate/continue call, retries included.
 * Keep this plus the embedding worst case (2 × 6s) comfortably under
 * TRAIL_MAX_DURATION_SECONDS so our typed JSON error wins the race against the
 * platform's own gateway timeout.
 */
export const TRAIL_GENERATION_BUDGET_MS = 42_000;

/** Timeout for a single Claude generate/continue HTTP request. */
export const TRAIL_GENERATION_REQUEST_TIMEOUT_MS = 35_000;

/** Never start another provider request with less than this left in the budget. */
export const TRAIL_MIN_REQUEST_WINDOW_MS = 1_500;

/** Timeout for a single retrieval-embedding request made by a trail route. */
export const TRAIL_EMBEDDING_TIMEOUT_MS = 6_000;

/** Retrieval embeddings get one try plus one retry inside the route budget. */
export const TRAIL_EMBEDDING_MAX_ATTEMPTS = 2;

/**
 * Browser-side guard for POST requests. It is slightly longer than maxDuration
 * so the server's JSON error normally reaches the client before this aborts.
 */
export const TRAIL_CLIENT_TIMEOUT_MS = 65_000;

/** A retry backoff that respects the remaining budget instead of overshooting it. */
export function nextBackoffMs(attempt: number): number {
  return 400 * 2 ** (attempt - 1);
}

/** Tracks the remaining time for a multi-request provider call. */
export class TrailDeadline {
  private readonly expiresAt: number;

  constructor(budgetMs: number = TRAIL_GENERATION_BUDGET_MS) {
    this.expiresAt = Date.now() + budgetMs;
  }

  remainingMs(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  get expired(): boolean {
    return this.remainingMs() <= 0;
  }

  /** True when there is still enough time to make (and retry) a request. */
  canStartRequest(minimumMs: number = TRAIL_MIN_REQUEST_WINDOW_MS): boolean {
    return this.remainingMs() > minimumMs;
  }

  /** Abort timeout capped by both the per-request limit and the budget. */
  timeoutSignal(perRequestMs: number): AbortSignal {
    return AbortSignal.timeout(
      Math.max(1, Math.min(perRequestMs, this.remainingMs())),
    );
  }
}
