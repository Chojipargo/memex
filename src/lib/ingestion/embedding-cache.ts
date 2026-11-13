/**
 * A small least-recently-used cache with expiry, for query embeddings. The
 * same question, search, or trail theme embeds to the same vector, so asking
 * it again shouldn't spend Gemini quota. It lives in server memory, so each
 * server instance has its own copy and a restart clears it.
 */
export class EmbeddingCache {
  private readonly entries = new Map<string, { vector: number[]; expiresAt: number }>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(maxEntries = 500, ttlMs = 60 * 60 * 1000, now: () => number = Date.now) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: string): number[] | null {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }

    // Re-insert so this key becomes the most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.vector;
  }

  set(key: string, vector: number[]): void {
    this.entries.delete(key);
    this.entries.set(key, { vector, expiresAt: this.now() + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
