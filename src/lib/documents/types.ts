export type ExtractionMethod = "ocr" | "text-layer" | "mixed";

export type ExtractionPage = {
  page: number;
  text: string;
  method: "ocr" | "text-layer";
};

export type ExtractedDocument = {
  text: string;
  pages: ExtractionPage[];
  pageCount: number;
  method: ExtractionMethod;
  previewUrl: string | null;
  mimeType: string;
  fileKind: "pdf" | "image";
};

export type IngestedDocument = {
  documentId: string;
  title: string;
  pages: number;
  textPages: number;
  chunks: number;
  tokens: number;
  model: string;
  dimensions: number;
  batchSize: number;
  extractionMethod: ExtractionMethod;
  trailLinked?: boolean;
};

export type DocumentCreated = {
  documentId: string;
  title: string;
  content: string;
  chunks: number;
  tokens: number;
  sourceName?: string;
  pageCount?: number;
  extraction?: ExtractionMethod | "note";
  trailId?: string | null;
};
