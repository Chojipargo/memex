import type { SVGProps } from "react";

/**
 * Original decorative line field: two ribbons of near-parallel curves sweep
 * across the canvas and taper into one shared stroke near the right side.
 * Purely presentational, tinted with `currentColor`.
 */

const START_X = -220;
const C2_X = 900;
const C2_Y = 516;
const MERGE_X = 1170;
const MERGE_Y = 462;

const direction = { x: MERGE_X - C2_X, y: MERGE_Y - C2_Y };
const length = Math.hypot(direction.x, direction.y);
const EXIT_X = MERGE_X + (direction.x / length) * 520;
const EXIT_Y = MERGE_Y + (direction.y / length) * 520;

type Ribbon = {
  count: number;
  spread: number;
  startY: number;
  controlY: number;
  controlX: number;
  drift: number;
};

const RIBBON_UPPER: Ribbon = {
  count: 28,
  spread: 250,
  startY: 640,
  controlY: 150,
  controlX: 310,
  drift: 0.16,
};

const RIBBON_LOWER: Ribbon = {
  count: 16,
  spread: 300,
  startY: 900,
  controlY: 1140,
  controlX: 250,
  drift: 0.12,
};

function ribbonPaths(ribbon: Ribbon) {
  const step = ribbon.count === 1 ? 0 : (ribbon.spread * 2) / (ribbon.count - 1);

  return Array.from({ length: ribbon.count }, (_, index) => {
    const offset = -ribbon.spread + index * step;
    const startX = START_X - (index % 3) * 45;
    const controlX =
      ribbon.controlX + offset * ribbon.drift + Math.sin(index * 1.3) * 18;
    const controlY =
      ribbon.controlY + offset * 0.82 + Math.cos(index * 0.7) * 14;
    const startY = ribbon.startY + offset;

    return `M ${startX} ${startY} C ${controlX} ${controlY}, ${C2_X} ${C2_Y}, ${MERGE_X} ${MERGE_Y}`;
  });
}

const UPPER_PATHS = ribbonPaths(RIBBON_UPPER);
const LOWER_PATHS = ribbonPaths(RIBBON_LOWER);
const ALL_PATHS = [...UPPER_PATHS, ...LOWER_PATHS];

const RIBBONS = [
  UPPER_PATHS[2],
  UPPER_PATHS[10],
  UPPER_PATHS[20],
  LOWER_PATHS[3],
  LOWER_PATHS[11],
];
const ACCENTS = [
  UPPER_PATHS[6],
  UPPER_PATHS[14],
  UPPER_PATHS[24],
  LOWER_PATHS[5],
  LOWER_PATHS[13],
];

const MERGED = `M ${MERGE_X} ${MERGE_Y} L ${EXIT_X} ${EXIT_Y}`;

export function FlowingLines({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
      className={`flow-lines ${className ?? ""}`}
      {...props}
    >
      <defs>
        <linearGradient
          id="flow-stroke"
          x1="-160"
          y1="0"
          x2={MERGE_X}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.18" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="0.78" stopColor="currentColor" stopOpacity="0.68" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Wide, low-contrast ribbons give the field depth */}
      <g
        stroke="url(#flow-stroke)"
        strokeWidth={30}
        opacity={0.045}
        vectorEffect="non-scaling-stroke"
      >
        {RIBBONS.map((d, index) => (
          <path key={`ribbon-${index}`} d={d} />
        ))}
      </g>

      {/* Fine background mesh */}
      <g
        stroke="url(#flow-stroke)"
        strokeWidth={0.85}
        opacity={0.22}
        vectorEffect="non-scaling-stroke"
      >
        {ALL_PATHS.map((d, index) => (
          <path key={`mesh-${index}`} d={d} />
        ))}
      </g>

      {/* Foreground strands */}
      <g
        stroke="url(#flow-stroke)"
        strokeWidth={1.15}
        opacity={0.4}
        vectorEffect="non-scaling-stroke"
      >
        {ALL_PATHS.filter((_, index) => index % 2 === 0).map((d, index) => (
          <path key={`strand-${index}`} d={d} />
        ))}
      </g>

      {/* Brighter accent strands */}
      <g
        stroke="url(#flow-stroke)"
        strokeWidth={1.9}
        opacity={0.55}
        vectorEffect="non-scaling-stroke"
      >
        {ACCENTS.map((d, index) => (
          <path key={`accent-${index}`} d={d} />
        ))}
      </g>

      {/* A slow highlight travels along a few strands */}
      <g
        stroke="url(#flow-stroke)"
        strokeWidth={2.4}
        opacity={0.8}
        vectorEffect="non-scaling-stroke"
      >
        {ACCENTS.filter((_, index) => index % 2 === 0).map((d, index) => (
          <path
            key={`comet-${index}`}
            d={d}
            className={index % 2 === 0 ? "flow-dash" : "flow-dash-slow"}
            style={{ animationDelay: `${-index * 3.5}s` }}
          />
        ))}
      </g>

      {/* The ribbon tapers into one line toward the right edge */}
      <g vectorEffect="non-scaling-stroke">
        <path
          d={MERGED}
          stroke="url(#flow-stroke)"
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.05}
        />
        <path
          d={MERGED}
          stroke="url(#flow-stroke)"
          strokeWidth={4.5}
          strokeLinecap="round"
          opacity={0.14}
        />
        <path
          d={MERGED}
          stroke="url(#flow-stroke)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.85}
        />
      </g>
    </svg>
  );
}
