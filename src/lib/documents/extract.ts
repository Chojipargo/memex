"use client";

import {
  DOCUMENT_MIME_TYPES,
  PDF_MIME,
} from "@/lib/ingestion/constants";

import { composeExtractedText } from "./pages";
import type {
  ExtractedDocument,
  ExtractionMethod,
  ExtractionPage,
} from "./types";

export type ExtractionProgress = {
  label: string;
  progress: number;
  page: number;
  pages: number;
};

type ExtractOptions = {
  onProgress?: (progress: ExtractionProgress) => void;
  signal?: AbortSignal;
};

type TesseractWorker = Awaited<
  ReturnType<typeof import("tesseract.js").createWorker>
>;

type PdfPage = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof import("pdfjs-dist").getDocument>["promise"]>["getPage"]
  >
>;

const PDF_WORKER_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@";

function abortError() {
  return new DOMException("The extraction was cancelled.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function cleanText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasUsefulTextLayer(text: string) {
  const characters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return text.length >= 40 && characters >= 24;
}

function methodForPages(pages: ExtractionPage[]): ExtractionMethod {
  const hasOcr = pages.some((page) => page.method === "ocr");
  const hasTextLayer = pages.some((page) => page.method === "text-layer");

  if (hasOcr && hasTextLayer) {
    return "mixed";
  }

  return hasOcr ? "ocr" : "text-layer";
}

function normalizedMime(file: File): string {
  const type = file.type.toLowerCase();

  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(type)) {
    return type;
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";

  if (extension === "pdf") return PDF_MIME;
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "bmp") return "image/bmp";

  return "";
}

export function isSupportedDocument(file: File) {
  return normalizedMime(file).length > 0;
}

export function documentKind(file: File): "pdf" | "image" {
  return normalizedMime(file) === PDF_MIME ? "pdf" : "image";
}

function friendlyOcrLabel(status: string) {
  if (status === "loading tesseract core") return "Loading OCR engine";
  if (status === "initializing tesseract") return "Initializing OCR engine";
  if (status === "loading language traineddata") {
    return "Loading English language data";
  }
  if (status === "initializing api") return "Preparing OCR";
  if (status === "recognizing text") return "Extracting text via OCR…";
  return "Extracting text via OCR…";
}

function progressValue(pageIndex: number, pageProgress: number, pages: number) {
  if (pages <= 0) return 0;

  const safeProgress = Number.isFinite(pageProgress) ? pageProgress : 0;
  const value =
    ((pageIndex + Math.min(1, Math.max(0, safeProgress))) / pages) * 100;

  return Math.min(100, Math.max(0, Math.round(value)));
}

async function createOcrWorker(
  context: { pageIndex: number; pages: number },
  onProgress: (progress: ExtractionProgress) => void,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);

  const tesseract = await import("tesseract.js");
  const worker = await tesseract.createWorker("eng", 1, {
    logger: (message) => {
      if (signal?.aborted) {
        return;
      }

      onProgress({
        label: friendlyOcrLabel(message.status),
        progress: progressValue(
          context.pageIndex,
          message.progress,
          context.pages,
        ),
        page: context.pageIndex + 1,
        pages: context.pages,
      });
    },
  });

  if (signal?.aborted) {
    await worker.terminate().catch(() => undefined);
    throw abortError();
  }

  return worker;
}

async function renderPdfPage(page: PdfPage, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));

  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("The browser could not create a canvas for this PDF.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, viewport }).promise;

  return canvas;
}

async function canvasToPreviewUrl(canvas: HTMLCanvasElement) {
  const blob =
    (await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    })) ?? null;

  return blob ? URL.createObjectURL(blob) : null;
}

async function extractPdf(
  file: File,
  options: ExtractOptions,
): Promise<ExtractedDocument> {
  const { onProgress, signal } = options;
  let previewUrl: string | null = null;
  let worker: TesseractWorker | null = null;
  let destroyPdf: (() => Promise<void>) | null = null;

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDF_WORKER_CDN}${pdfjs.version}/build/pdf.worker.min.mjs`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    throwIfAborted(signal);

    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: true,
    });
    destroyPdf = async () => {
      await loadingTask.destroy();
    };

    let pdf: Awaited<typeof loadingTask.promise>;

    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";

      if (name === "PasswordException") {
        throw new Error(
          "This PDF is password-protected. Remove the password and try again.",
        );
      }

      throw new Error(
        "This PDF could not be opened. It may be encrypted, damaged, or unsupported.",
      );
    }

    const pages: ExtractionPage[] = [];
    const pageCount = pdf.numPages;
    const ocrProgress = { pageIndex: 0, pages: pageCount };

    for (let index = 0; index < pageCount; index += 1) {
      throwIfAborted(signal);

      onProgress?.({
        label: `Reading page ${index + 1} of ${pageCount}`,
        progress: progressValue(index, 0, pageCount),
        page: index + 1,
        pages: pageCount,
      });

      const page = await pdf.getPage(index + 1);
      const textContent = await page.getTextContent();
      let embeddedText = "";

      for (const item of textContent.items) {
        if (!("str" in item)) {
          continue;
        }

        embeddedText += item.str;
        embeddedText += item.hasEOL ? "\n" : " ";
      }

      embeddedText = cleanText(embeddedText);

      let pageText = embeddedText;
      let pageMethod: "ocr" | "text-layer" = "text-layer";
      let ocrCanvas: HTMLCanvasElement | null = null;

      if (!hasUsefulTextLayer(embeddedText)) {
        ocrCanvas = await renderPdfPage(page, 2);
        throwIfAborted(signal);

        ocrProgress.pageIndex = index;

        if (!worker) {
          worker = await createOcrWorker(
            ocrProgress,
            (progress) => onProgress?.(progress),
            signal,
          );
        }

        const result = await worker.recognize(ocrCanvas);
        throwIfAborted(signal);
        const ocrText = cleanText(result.data.text);

        if (ocrText.length > 0) {
          pageText = ocrText;
          pageMethod = "ocr";
        }
      }

      pages.push({
        page: index + 1,
        text: pageText,
        method: pageMethod,
      });

      if (index === 0 && !previewUrl) {
        try {
          const previewCanvas = ocrCanvas ?? (await renderPdfPage(page, 1.45));
          previewUrl = await canvasToPreviewUrl(previewCanvas);
          previewCanvas.width = 0;
          previewCanvas.height = 0;
        } catch {
          // The preview is a convenience; keep the extracted text even when
          // the browser cannot rasterize the first page.
          if (ocrCanvas) {
            ocrCanvas.width = 0;
            ocrCanvas.height = 0;
          }
          previewUrl = null;
        }
      } else if (ocrCanvas) {
        ocrCanvas.width = 0;
        ocrCanvas.height = 0;
      }

      page.cleanup();

      onProgress?.({
        label:
          pageText.length > 0
            ? `Finished page ${index + 1} of ${pageCount}`
            : `Page ${index + 1} had no readable text`,
        progress: progressValue(index + 1, 0, pageCount),
        page: index + 1,
        pages: pageCount,
      });
    }

    const readablePages = pages.filter((page) => page.text.length > 0);

    if (readablePages.length === 0) {
      throw new Error(
        "No readable text was found. Try a clearer scan or enter the text manually.",
      );
    }

    const method = methodForPages(readablePages);

    return {
      text: composeExtractedText(readablePages),
      pages: readablePages,
      pageCount,
      method,
      previewUrl,
      mimeType: PDF_MIME,
      fileKind: "pdf",
    };
  } catch (error) {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    throw error;
  } finally {
    if (destroyPdf) {
      await destroyPdf().catch(() => undefined);
    }

    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }
}

async function extractImage(
  file: File,
  options: ExtractOptions,
): Promise<ExtractedDocument> {
  const { onProgress, signal } = options;
  const previewUrl = URL.createObjectURL(file);
  let worker: TesseractWorker | null = null;

  try {
    throwIfAborted(signal);

    onProgress?.({
      label: "Extracting text via OCR…",
      progress: 0,
      page: 1,
      pages: 1,
    });

    worker = await createOcrWorker(
      { pageIndex: 0, pages: 1 },
      (progress) => onProgress?.(progress),
      signal,
    );

    const result = await worker.recognize(file);
    throwIfAborted(signal);

    const text = cleanText(result.data.text);

    if (!text) {
      throw new Error(
        "No readable text was found. Try a clearer image or enter the text manually.",
      );
    }

    const pages: ExtractionPage[] = [
      {
        page: 1,
        text,
        method: "ocr",
      },
    ];

    onProgress?.({
      label: "OCR complete",
      progress: 100,
      page: 1,
      pages: 1,
    });

    return {
      text,
      pages,
      pageCount: 1,
      method: "ocr",
      previewUrl,
      mimeType: normalizedMime(file),
      fileKind: "image",
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  } finally {
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }
}

export async function extractDocument(
  file: File,
  options: ExtractOptions = {},
): Promise<ExtractedDocument> {
  const mime = normalizedMime(file);

  if (!mime) {
    throw new Error("Choose a PDF, PNG, JPEG, WebP, or BMP file.");
  }

  if (mime === PDF_MIME) {
    return extractPdf(file, options);
  }

  return extractImage(file, options);
}
