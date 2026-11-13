/**
 * Plain-text extraction for PowerPoint (.pptx) decks.
 *
 * A .pptx is a zip of OOXML parts, so reading it with `File.text()` yields
 * binary noise. This unzips only the slide and notes parts and pulls the text
 * runs out of them, in presentation order. Runs in the browser and in Node.
 */
import { unzipSync } from "fflate";

export { isLegacyPptName, isPptxName } from "./pptx-names.ts";

export type PptxSlide = {
  number: number;
  text: string;
  notes: string;
};

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const PART_PATTERN =
  /^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/;

/**
 * Placeholders whose text is boilerplate (slide numbers, dates, footers, the
 * slide thumbnail on a notes page) rather than content.
 */
const BOILERPLATE_PLACEHOLDER = /<p:ph\b[^>]*\btype="(?:sldNum|dt|ftr|hdr|sldImg)"/;

export class PptxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PptxError";
  }
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi,
    (match, decimal: string, hex: string, named: string) => {
      if (decimal || hex) {
        const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
        return Number.isFinite(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      }

      switch (named.toLowerCase()) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        default:
          return "'";
      }
    },
  );
}

/** Text of one DrawingML text body: one line per paragraph, breaks kept. */
function paragraphsOf(xml: string): string[] {
  const lines: string[] = [];

  for (const paragraph of xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? []) {
    let line = "";

    for (const token of paragraph.match(
      /<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>|<a:br\b[^>]*\/>/g,
    ) ?? []) {
      line += token.startsWith("<a:br")
        ? "\n"
        : decodeXmlEntities(token.replace(/^<a:t[^>]*>|<\/a:t>$/g, ""));
    }

    const trimmed = line.replace(/[ \t]+/g, " ").trim();

    if (trimmed) {
      lines.push(trimmed);
    }
  }

  return lines;
}

/** Visible text of a slide or notes part, skipping boilerplate placeholders. */
export function textOfPart(xml: string): string {
  const shapes = xml.match(/<p:(?:sp|graphicFrame)\b[\s\S]*?<\/p:(?:sp|graphicFrame)>/g);

  // Shapes that carry no placeholder info are always content; fall back to
  // the whole part when a deck uses no recognisable shape wrappers.
  const bodies = shapes
    ? shapes.filter((shape) => !BOILERPLATE_PLACEHOLDER.test(shape))
    : [xml];

  return bodies.flatMap(paragraphsOf).join("\n");
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : null;
}

/** rId → target path, resolved relative to `baseDir` (e.g. "ppt/slides"). */
function relationships(xml: string | undefined, baseDir: string) {
  const targets = new Map<string, { type: string; path: string }>();

  for (const tag of xml?.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attribute(tag, "Id");
    const target = attribute(tag, "Target");

    if (!id || !target || attribute(tag, "TargetMode") === "External") {
      continue;
    }

    const parts = target.startsWith("/")
      ? target.slice(1).split("/")
      : [...baseDir.split("/"), ...target.split("/")];
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === "..") resolved.pop();
      else if (part && part !== ".") resolved.push(part);
    }

    targets.set(id, { type: attribute(tag, "Type") ?? "", path: resolved.join("/") });
  }

  return targets;
}

function slideNumberOf(path: string): number {
  return Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

/** Slide part paths in presentation order, falling back to file numbering. */
function orderedSlidePaths(parts: Map<string, string>): string[] {
  const presentation = parts.get("ppt/presentation.xml");
  const rels = relationships(parts.get("ppt/_rels/presentation.xml.rels"), "ppt");
  const ordered: string[] = [];

  for (const tag of presentation?.match(/<p:sldId\b[^>]*>/g) ?? []) {
    const rId = attribute(tag, "r:id");
    const path = rId ? rels.get(rId)?.path : undefined;

    if (path && parts.has(path) && !ordered.includes(path)) {
      ordered.push(path);
    }
  }

  if (ordered.length > 0) {
    return ordered;
  }

  return [...parts.keys()]
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumberOf(a) - slideNumberOf(b));
}

export function extractPptxSlides(bytes: Uint8Array): PptxSlide[] {
  if (startsWith(bytes, OLE_SIGNATURE)) {
    throw new PptxError(
      "This is an older .ppt file. Open it in PowerPoint and save it as .pptx, then import it again.",
    );
  }

  if (!startsWith(bytes, ZIP_SIGNATURE)) {
    throw new PptxError("That file is not a valid PowerPoint (.pptx) deck.");
  }

  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(bytes, { filter: (file) => PART_PATTERN.test(file.name) });
  } catch {
    throw new PptxError("That PowerPoint file could not be opened. It may be damaged.");
  }

  const decoder = new TextDecoder("utf-8");
  const parts = new Map(
    Object.entries(files).map(([path, data]) => [path, decoder.decode(data)]),
  );
  const slidePaths = orderedSlidePaths(parts);

  if (slidePaths.length === 0) {
    throw new PptxError("No slides were found in that PowerPoint file.");
  }

  return slidePaths.map((path, index) => {
    const name = path.split("/").pop() ?? "";
    const slideRels = relationships(
      parts.get(`ppt/slides/_rels/${name}.rels`),
      "ppt/slides",
    );
    const notesPath = [...slideRels.values()].find((rel) =>
      rel.type.endsWith("/notesSlide"),
    )?.path;
    const notesXml = notesPath ? parts.get(notesPath) : undefined;

    return {
      number: index + 1,
      text: textOfPart(parts.get(path) ?? ""),
      notes: notesXml ? textOfPart(notesXml) : "",
    };
  });
}

/** Slides as readable note text, one section per slide with its speaker notes. */
export function formatPptxSlides(slides: ReadonlyArray<PptxSlide>): string {
  return slides
    .filter((slide) => slide.text || slide.notes)
    .map((slide) => {
      const sections = [`Slide ${slide.number}`];

      if (slide.text) sections.push(slide.text);
      if (slide.notes) sections.push(`Speaker notes:\n${slide.notes}`);

      return sections.join("\n");
    })
    .join("\n\n");
}

export function extractPptxText(bytes: Uint8Array): string {
  const text = formatPptxSlides(extractPptxSlides(bytes));

  if (!text) {
    throw new PptxError(
      "That deck has no readable text. Slides that are only images need OCR: export them as PDF or images and upload those instead.",
    );
  }

  return text;
}
