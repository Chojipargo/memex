"use client";

import { useId, useState } from "react";

import type { MapEdge, MapNode, NoteKind, TrailNode } from "@/lib/dashboard/data";

function pointList(count: number) {
  const width = 180;
  const height = 50;
  const pad = 10;

  return Array.from({ length: count }, (_, index) => ({
    x: count === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (count - 1),
    y: height / 2 + Math.sin(index * 1.5) * 7,
  }));
}

function smoothPath(points: { x: number; y: number }[]) {
  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const mid = (previous.x + point.x) / 2;

    return `${path} C ${mid} ${previous.y}, ${mid} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export function TrailMiniGraph({
  nodes,
  active = false,
  className = "",
}: {
  nodes: TrailNode[];
  active?: boolean;
  className?: string;
}) {
  const points = pointList(nodes.length);
  const path = smoothPath(points);
  const branchIndex = Math.min(2, points.length - 1);
  const branch = points[branchIndex];

  return (
    <svg
      viewBox="0 0 180 50"
      fill="none"
      aria-hidden="true"
      className={`h-12 w-full overflow-visible text-neutral-500 ${className}`}
    >
      {nodes.length > 2 && branch ? (
        <path
          d={`M ${branch.x} ${branch.y} C ${branch.x - 6} ${branch.y + 8}, ${branch.x + 18} ${branch.y + 12}, ${branch.x + 28} ${branch.y + 17}`}
          stroke="currentColor"
          strokeWidth={0.8}
          strokeDasharray="2 4"
          opacity={0.3}
        />
      ) : null}

      <path
        d={path}
        stroke="currentColor"
        strokeWidth={active ? 1.35 : 1}
        opacity={active ? 0.72 : 0.42}
        strokeLinecap="round"
      />

      {points.map((point, index) => (
        <g key={nodes[index]?.id ?? index}>
          <circle
            cx={point.x}
            cy={point.y}
            r={active && index === 0 ? 5.5 : 4}
            fill="#0d0d0d"
            stroke="currentColor"
            strokeWidth={1.25}
            opacity={active ? 1 : 0.8}
          />
          <circle
            cx={point.x}
            cy={point.y}
            r={1.6}
            fill="currentColor"
            opacity={active ? 0.95 : 0.65}
          />
        </g>
      ))}
    </svg>
  );
}

function kindShape(kind: NoteKind, x: number, y: number) {
  if (kind === "source") {
    return <rect x={x - 4.5} y={y - 4.5} width={9} height={9} rx={2} />;
  }

  if (kind === "question") {
    return (
      <circle
        cx={x}
        cy={y}
        r={4.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeDasharray="1.5 2"
      />
    );
  }

  if (kind === "quote") {
    return <circle cx={x} cy={y} r={4} fill="currentColor" />;
  }

  return (
    <circle
      cx={x}
      cy={y}
      r={4}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
    />
  );
}

export function AssociativeMap({
  nodes,
  edges,
  onOpenNote,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  onOpenNote: (noteId: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const patternId = `map-dots-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <svg
      viewBox="0 0 760 310"
      fill="none"
      role="img"
      aria-label="Associative map of notes and the links between them"
      className="h-auto w-full overflow-visible"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width="28"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.16" />
        </pattern>
      </defs>

      <rect
        width="760"
        height="310"
        fill={`url(#${patternId})`}
        className="text-neutral-500"
      />

      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);

        if (!from || !to) {
          return null;
        }

        const isActive = hovered === from.id || hovered === to.id;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 18;

        return (
          <path
            key={edge.id}
            d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
            stroke="currentColor"
            strokeWidth={isActive ? 1.35 : 0.8}
            strokeLinecap="round"
            opacity={isActive ? 0.7 : 0.2 + edge.strength / 300}
            className={isActive ? "transition-all duration-300" : "transition-all duration-300"}
          />
        );
      })}

      {nodes.map((node) => {
        const isHovered = hovered === node.id;
        const isConnected =
          hovered !== null &&
          edges.some(
            (edge) =>
              (edge.from === hovered && edge.to === node.id) ||
              (edge.to === hovered && edge.from === node.id),
          );
        const dimmed = hovered !== null && !isHovered && !isConnected;

        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`Open note: ${node.label}`}
            onClick={() => onOpenNote(node.noteId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenNote(node.noteId);
              }
            }}
            onMouseEnter={() => setHovered(node.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(node.id)}
            onBlur={() => setHovered(null)}
            className="cursor-pointer text-neutral-200 outline-none transition-opacity duration-300"
            opacity={dimmed ? 0.35 : 1}
          >
            <title>{node.label}</title>
            {isHovered ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={18}
                fill="currentColor"
                opacity={0.06}
              />
            ) : null}
            <circle
              cx={node.x}
              cy={node.y}
              r={9.5}
              fill="#0a0a0a"
              stroke="currentColor"
              strokeWidth={isHovered ? 1.4 : 0.85}
              opacity={isHovered ? 1 : 0.7}
            />
            <g className="text-neutral-300">{kindShape(node.kind, node.x, node.y)}</g>
            <text
              x={node.x}
              y={node.y + 25}
              textAnchor="middle"
              fill="currentColor"
              fontSize={10.5}
              letterSpacing="0.01em"
              opacity={isHovered ? 1 : 0.72}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
