/** Shared, client-safe types for the hybrid RAG pipeline. */

/** Where a retrieved passage came from. `library` covers uploads and notes. */
export type SourceOrigin = "library" | "web";

/** Provenance shown on a trail, trail node, or note. */
export type Provenance = "library" | "web" | "hybrid";

/** Stored in `documents.source_kind`. */
export type DocumentSourceKind = "upload" | "note" | "web";

/** A web page selected for research, before it is chunked and embedded. */
export type WebSource = {
  title: string;
  url: string;
  domain: string;
  content: string;
  publishedAt: string | null;
  provider: string;
};

export type ProgressStage = "searching" | "researching" | "weaving";

export type TrailProgress = {
  stage: ProgressStage;
  message: string;
};

/** Derive the badge for a set of step origins. */
export function provenanceOf(origins: ReadonlyArray<SourceOrigin>): Provenance {
  if (origins.length === 0) {
    return "library";
  }

  const hasLibrary = origins.includes("library");
  const hasWeb = origins.includes("web");

  return hasLibrary && hasWeb ? "hybrid" : hasWeb ? "web" : "library";
}
