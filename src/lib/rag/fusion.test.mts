import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readStepWeight, reciprocalRankFusion } from "./fusion.ts";

const ids = (fused: { item: { id: number } }[]) => fused.map((entry) => entry.item.id);
const list = (...values: number[]) => values.map((id) => ({ id }));

describe("reciprocalRankFusion", () => {
  it("promotes items both searches agree on over items only one ranks first", () => {
    // Question-only search puts 1 first; the passage search never sees it.
    // 3 is second in both, so fusion ranks it first.
    const question = list(1, 3, 4);
    const passage = list(2, 3, 5);
    const fused = reciprocalRankFusion(
      [
        { items: passage, weight: 0.5 },
        { items: question, weight: 0.5 },
      ],
      (item) => item.id,
    );

    assert.equal(ids(fused)[0], 3);
    // Question-only order would have been [1, 3, 4].
    assert.notEqual(ids(fused)[0], question[0].id);
  });

  it("matches the single list when the other has no weight", () => {
    const fused = reciprocalRankFusion(
      [
        { items: list(9, 8, 7), weight: 1 },
        { items: list(1, 2, 3), weight: 0 },
      ],
      (item) => item.id,
    );

    assert.deepEqual(ids(fused), [9, 8, 7]);
  });

  it("lets the weight tilt the ranking toward one search", () => {
    const passage = list(1, 2);
    const question = list(2, 1);
    const towardPassage = reciprocalRankFusion(
      [
        { items: passage, weight: 0.8 },
        { items: question, weight: 0.2 },
      ],
      (item) => item.id,
    );
    const towardQuestion = reciprocalRankFusion(
      [
        { items: passage, weight: 0.2 },
        { items: question, weight: 0.8 },
      ],
      (item) => item.id,
    );

    assert.equal(ids(towardPassage)[0], 1);
    assert.equal(ids(towardQuestion)[0], 2);
  });

  it("keeps the first copy of a duplicate and stays stable on ties", () => {
    const first = { id: 1, label: "first" };
    const fused = reciprocalRankFusion(
      [
        { items: [first, { id: 2, label: "a" }], weight: 0.5 },
        { items: [{ id: 2, label: "b" }, { id: 1, label: "second" }], weight: 0.5 },
      ],
      (item) => item.id,
    );

    assert.equal(fused.length, 2);
    assert.deepEqual(fused.map((entry) => entry.item.id), [1, 2]);
    assert.equal(fused[0].item.label, "first");
  });
});

describe("readStepWeight", () => {
  it("accepts weights between 0 and 1", () => {
    assert.equal(readStepWeight("0.7"), 0.7);
    assert.equal(readStepWeight("0"), 0);
    assert.equal(readStepWeight("1"), 1);
  });

  it("falls back to an even split for anything else", () => {
    assert.equal(readStepWeight(undefined), 0.5);
    assert.equal(readStepWeight(""), 0.5);
    assert.equal(readStepWeight("1.5"), 0.5);
    assert.equal(readStepWeight("abc"), 0.5);
  });
});
