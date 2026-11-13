/**
 * Deterministic force-directed layout (Fruchterman-Reingold) for the small
 * association map. Strongly associated passages pull together; everything
 * repels a little so labels don't pile up. The same input always gives the
 * same picture, so the map doesn't jump around between renders.
 */

export type LayoutEdge = { source: number; target: number; weight: number };
export type Point = { x: number; y: number };

export type LayoutOptions = {
  width: number;
  height: number;
  /** Space kept clear at each edge for node labels. */
  padding: number;
  iterations?: number;
};

export function layoutGraph(
  nodeIds: ReadonlyArray<number>,
  edges: ReadonlyArray<LayoutEdge>,
  { width, height, padding, iterations = 300 }: LayoutOptions,
): Map<number, Point> {
  const positions = new Map<number, Point>();
  const count = nodeIds.length;

  if (count === 0) {
    return positions;
  }

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const centerX = width / 2;
  const centerY = height / 2;

  // Start on an ellipse in the given order (strongest first), so the result
  // is deterministic and the busiest passages start near each other.
  nodeIds.forEach((id, index) => {
    const angle = (index / count) * Math.PI * 2;
    const ring = count === 1 ? 0 : 1;
    positions.set(id, {
      x: centerX + Math.cos(angle) * (innerWidth / 2) * 0.8 * ring,
      y: centerY + Math.sin(angle) * (innerHeight / 2) * 0.8 * ring,
    });
  });

  if (count === 1) {
    return positions;
  }

  const ids = [...nodeIds];
  const known = new Set(ids);
  const usable = edges.filter(
    (edge) => known.has(edge.source) && known.has(edge.target) && edge.source !== edge.target,
  );
  const maxWeight = Math.max(1e-9, ...usable.map((edge) => edge.weight));
  const ideal = Math.sqrt((innerWidth * innerHeight) / count) * 0.75;
  let temperature = innerWidth / 8;
  const cooling = temperature / (iterations + 1);

  for (let step = 0; step < iterations; step++) {
    const shift = new Map<number, Point>(ids.map((id) => [id, { x: 0, y: 0 }]));

    // Repulsion between every pair.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i])!;
        const b = positions.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.hypot(dx, dy);

        if (distance < 0.01) {
          // Nudge coincident points apart deterministically.
          dx = (i - j) * 0.01;
          dy = 0.01;
          distance = Math.hypot(dx, dy);
        }

        const force = (ideal * ideal) / distance;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        shift.get(ids[i])!.x += fx;
        shift.get(ids[i])!.y += fy;
        shift.get(ids[j])!.x -= fx;
        shift.get(ids[j])!.y -= fy;
      }
    }

    // Attraction along edges, stronger for heavier associations.
    for (const edge of usable) {
      const a = positions.get(edge.source)!;
      const b = positions.get(edge.target)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.max(0.01, Math.hypot(dx, dy));
      const force = ((distance * distance) / ideal) * (0.4 + (edge.weight / maxWeight) * 1.6);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      shift.get(edge.source)!.x -= fx;
      shift.get(edge.source)!.y -= fy;
      shift.get(edge.target)!.x += fx;
      shift.get(edge.target)!.y += fy;
    }

    for (const id of ids) {
      const point = positions.get(id)!;
      const delta = shift.get(id)!;
      const length = Math.max(0.01, Math.hypot(delta.x, delta.y));
      const move = Math.min(length, temperature);
      // A gentle pull to the middle keeps disconnected clusters on screen.
      point.x += (delta.x / length) * move + (centerX - point.x) * 0.01;
      point.y += (delta.y / length) * move + (centerY - point.y) * 0.01;
    }

    temperature = Math.max(0.5, temperature - cooling);
  }

  return fitToBox(positions, width, height, padding);
}

/** Scale and centre the layout to fill the box inside the padding. */
function fitToBox(
  positions: Map<number, Point>,
  width: number,
  height: number,
  padding: number,
): Map<number, Point> {
  const points = [...positions.values()];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const fitted = new Map<number, Point>();

  for (const [id, point] of positions) {
    fitted.set(id, {
      x: maxX === minX ? width / 2 : padding + ((point.x - minX) / spanX) * (width - padding * 2),
      y: maxY === minY ? height / 2 : padding + ((point.y - minY) / spanY) * (height - padding * 2),
    });
  }

  return fitted;
}
