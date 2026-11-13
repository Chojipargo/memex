import type { Provenance, SourceOrigin } from "@/lib/rag/types";

const LABELS: Record<Provenance, string> = {
  library: "In Your Library",
  web: "Web Synthesized",
  hybrid: "Hybrid",
};

const DETAILS: Record<Provenance, string> = {
  library: "Grounded in your uploaded documents and notes.",
  web: "Grounded in researched web sources.",
  hybrid: "Grounded in your library and researched web sources.",
};

function dotClass(provenance: Provenance): string {
  if (provenance === "web") {
    return "bg-white";
  }

  if (provenance === "hybrid") {
    return "bg-[linear-gradient(90deg,#ffffff_0_50%,#525252_50%_100%)]";
  }

  return "bg-neutral-500";
}

/** Monochrome badge used on trails, steps, and source drawers. */
export function ProvenancePill({
  provenance,
  className = "",
}: {
  provenance: Provenance;
  className?: string;
}) {
  return (
    <span
      title={DETAILS[provenance]}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 font-mono text-[11.5px] uppercase tracking-[0.16em] text-neutral-300 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${dotClass(provenance)}`}
      />
      {LABELS[provenance]}
    </span>
  );
}

export function originProvenance(origin: SourceOrigin | undefined): Provenance {
  return origin === "web" ? "web" : "library";
}
