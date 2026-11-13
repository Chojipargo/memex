/**
 * Weighted Reciprocal Rank Fusion.
 *
 * Each list votes for its items by rank: an item at 1-based rank r in a list
 * of weight w earns w / (k + r). Scores add up across lists, so an item that
 * ranks well in both the "near this passage" search and the "about this
 * question" search beats one that tops only a single list. Using ranks rather
 * than raw cosine scores keeps the two searches comparable even when one
 * query sits in a denser region of embedding space.
 */

/** The usual RRF constant; it damps the gap between the very top ranks. */
export const RRF_K = 60;

/** Default share of the vote given to the current passage over the question. */
export const DEFAULT_STEP_WEIGHT = 0.5;

export type RankedList<T> = {
  items: ReadonlyArray<T>;
  weight: number;
};

export type Fused<T> = {
  item: T;
  score: number;
};

export function reciprocalRankFusion<T>(
  lists: ReadonlyArray<RankedList<T>>,
  keyOf: (item: T) => string | number,
  k: number = RRF_K,
): Fused<T>[] {
  const fused = new Map<string | number, Fused<T> & { firstSeen: number }>();
  let order = 0;

  for (const list of lists) {
    if (!(list.weight > 0)) {
      continue;
    }

    list.items.forEach((item, index) => {
      const key = keyOf(item);
      const vote = list.weight / (k + index + 1);
      const existing = fused.get(key);

      if (existing) {
        existing.score += vote;
      } else {
        fused.set(key, { item, score: vote, firstSeen: order++ });
      }
    });
  }

  return [...fused.values()]
    // Ties keep the order items were first seen in, so results are stable.
    .sort((left, right) => right.score - left.score || left.firstSeen - right.firstSeen)
    .map(({ item, score }) => ({ item, score }));
}

/** Parse the configured passage weight, falling back to an even split. */
export function readStepWeight(value: string | undefined): number {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_STEP_WEIGHT;
}
