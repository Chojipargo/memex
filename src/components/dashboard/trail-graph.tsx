"use client";

import { useId, useMemo, useState } from "react";

import type { TrailNode } from "@/lib/dashboard/data";
import { layoutGraph } from "@/lib/graph/layout";
import type { AssociationGraph, GraphEdge, GraphNode } from "@/lib/graph/types";

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
      className={`h-12 w-full overflow-visible text-neutral-400 ${className}`}
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

const MAP_WIDTH = 760;
const MAP_HEIGHT = 310;

function shortLabel(title: string, page: number): string {
  const clean = title.replace(/(?:\s*\(\d+\))+$/, "").trim() || title;
  const short = clean.length > 22 ? `${clean.slice(0, 21).trimEnd()}…` : clean;
  return `${short} · p.${page}`;
}

/** Dash pattern by where the association comes from. */
function edgeDash(origin: GraphEdge["origin"]): string | undefined {
  if (origin === "user") {
    return undefined;
  }

  return origin === "claude_accepted" ? "5 3" : "1.5 3.5";
}

function edgeTitle(edge: GraphEdge): string {
  const parts = [
    edge.reason ?? "Appear together on your trails",
    edge.origin === "user" ? "Your link" : edge.origin === "claude_accepted" ? "Claude's link" : "Trail co-occurrence only",
  ];

  if (edge.traversalCount > 0) {
    parts.push(`followed ${edge.traversalCount}×`);
  }

  return parts.join(" · ");
}

/**
 * The reader's association map: passages placed by a force layout, edges
 * drawn thicker and brighter the more they have been walked, and styled by
 * origin (solid: your link, dashed: Claude's link, dotted: only appear
 * together on trails).
 */
export function AssociativeMap({
  graph,
  onOpenPassage,
}: {
  graph: AssociationGraph;
  onOpenPassage: (node: GraphNode) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const patternId = `map-dots-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const positions = useMemo(
    () =>
      layoutGraph(
        graph.nodes.map((node) => node.chunkId),
        graph.edges,
        { width: MAP_WIDTH, height: MAP_HEIGHT, padding: 46 },
      ),
    [graph],
  );
  const maxWeight = Math.max(1e-9, ...graph.edges.map((edge) => edge.weight));
  const maxScore = Math.max(1e-9, ...graph.nodes.map((node) => node.score));

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      fill="none"
      role="img"
      aria-label="Association map of your passages, weighted by the links you follow and the trails you walk"
      className="h-auto w-full overflow-visible"
    >
      <defs>
        <pattern id={patternId} x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="currentColor" opacity="0.16" />
        </pattern>
      </defs>

      <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${patternId})`} className="text-neutral-400" />

      {graph.edges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);

        if (!from || !to) {
          return null;
        }

        const strength = edge.weight / maxWeight;
        const isActive = hovered === edge.source || hovered === edge.target;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 14;

        return (
          <path
            key={`${edge.source}-${edge.target}`}
            d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
            stroke="currentColor"
            strokeWidth={0.6 + strength * 2.6 + (isActive ? 0.5 : 0)}
            strokeDasharray={edgeDash(edge.origin)}
            strokeLinecap="round"
            opacity={isActive ? 0.85 : 0.14 + strength * 0.6}
            className="text-neutral-200 transition-all duration-300"
          >
            <title>{edgeTitle(edge)}</title>
          </path>
        );
      })}

      {graph.nodes.map((node) => {
        const point = positions.get(node.chunkId);

        if (!point) {
          return null;
        }

        const isHovered = hovered === node.chunkId;
        const isConnected =
          hovered !== null &&
          graph.edges.some(
            (edge) =>
              (edge.source === hovered && edge.target === node.chunkId) ||
              (edge.target === hovered && edge.source === node.chunkId),
          );
        const dimmed = hovered !== null && !isHovered && !isConnected;
        const radius = 6.5 + (node.score / maxScore) * 5.5;
        const label = shortLabel(node.documentTitle, node.page);

        return (
          <g
            key={node.chunkId}
            role="button"
            tabIndex={0}
            aria-label={`Open passage: ${node.documentTitle}, page ${node.page}`}
            onClick={() => onOpenPassage(node)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenPassage(node);
              }
            }}
            onMouseEnter={() => setHovered(node.chunkId)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(node.chunkId)}
            onBlur={() => setHovered(null)}
            className="cursor-pointer text-neutral-200 outline-none transition-opacity duration-300"
            opacity={dimmed ? 0.3 : 1}
          >
            <title>
              {`${node.documentTitle}, p.${node.page} · on ${node.trailCount} trail${node.trailCount === 1 ? "" : "s"}`}
            </title>
            {isHovered ? (
              <circle cx={point.x} cy={point.y} r={radius + 8} fill="currentColor" opacity={0.07} />
            ) : null}
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill="#0a0a0a"
              stroke="currentColor"
              strokeWidth={isHovered ? 1.5 : 0.9}
              opacity={isHovered ? 1 : 0.8}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={node.sourceOrigin === "web" ? 2.4 : 3}
              fill={node.sourceOrigin === "web" ? "none" : "currentColor"}
              stroke="currentColor"
              strokeWidth={1.1}
              opacity={0.85}
            />
            <text
              x={point.x}
              y={point.y + radius + 13}
              textAnchor="middle"
              fill="currentColor"
              fontSize={10}
              letterSpacing="0.01em"
              opacity={isHovered ? 1 : 0.7}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
