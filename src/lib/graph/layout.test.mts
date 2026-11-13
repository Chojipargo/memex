import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { layoutGraph } from "./layout.ts";

const box = { width: 760, height: 310, padding: 40 };

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("layoutGraph", () => {
  it("is deterministic", () => {
    const edges = [
      { source: 1, target: 2, weight: 3 },
      { source: 2, target: 3, weight: 1 },
    ];
    const first = layoutGraph([1, 2, 3, 4], edges, box);
    const second = layoutGraph([1, 2, 3, 4], edges, box);

    assert.deepEqual([...first.entries()], [...second.entries()]);
  });

  it("keeps every node inside the padded box", () => {
    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    const edges = ids.slice(1).map((id) => ({ source: id - 1, target: id, weight: id % 3 + 1 }));
    const positions = layoutGraph(ids, edges, box);

    for (const point of positions.values()) {
      assert.ok(point.x >= box.padding - 1e-6 && point.x <= box.width - box.padding + 1e-6);
      assert.ok(point.y >= box.padding - 1e-6 && point.y <= box.height - box.padding + 1e-6);
    }
  });

  it("pulls strongly associated passages closer than weakly associated ones", () => {
    // Two pairs: 1-2 walked often, 3-4 barely; 2-3 bridges them.
    const positions = layoutGraph(
      [1, 2, 3, 4],
      [
        { source: 1, target: 2, weight: 10 },
        { source: 2, target: 3, weight: 1 },
        { source: 3, target: 4, weight: 0.2 },
      ],
      box,
    );

    assert.ok(
      distance(positions.get(1)!, positions.get(2)!) < distance(positions.get(3)!, positions.get(4)!),
    );
  });

  it("centres a single node", () => {
    const positions = layoutGraph([7], [], box);
    assert.deepEqual(positions.get(7), { x: box.width / 2, y: box.height / 2 });
  });
});
