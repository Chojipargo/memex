import "server-only";

import type { WebSource } from "@/lib/rag/types";
import {
  isPublicHttpUrl,
  normalizeSourceUrl,
  sourceDomainOf,
} from "@/lib/rag/url";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CONTENT_CHARS = 60_000;
const MAX_RAW_BYTES = 2_000_000;
const MAX_RESULTS = 8;

export class WebSearchError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "WebSearchError";
    this.status = status;
  }
}

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

function tavilyKey(): string {
  const key = process.env.TAVILY_API_KEY?.trim();

  if (!key) {
    throw new WebSearchError(
      "Web research is not configured. Add TAVILY_API_KEY to .env.local, then try again.",
      503,
    );
  }

  return key;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  mdash: "\u2014",
  ndash: "\u2013",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();

    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }

    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }

    return ENTITIES[lower] ?? match;
  });
}

/** Basic, dependency-free HTML to text for direct URL extraction. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanContent(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

function cleanTitle(value: unknown, fallback: string): string {
  const title =
    typeof value === "string"
      ? value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim()
      : "";

  return (title || fallback).slice(0, 200);
}

function parsePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function toWebSource(value: unknown, provider: string): WebSource | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const rawUrl = typeof row.url === "string" ? row.url : "";
  const url = normalizeSourceUrl(rawUrl);

  if (!url) {
    return null;
  }

  const rawContent =
    typeof row.raw_content === "string" && row.raw_content.trim()
      ? row.raw_content
      : row.content;
  const content = cleanContent(rawContent);

  if (content.length < 120) {
    return null;
  }

  const domain = sourceDomainOf(url);

  return {
    title: cleanTitle(row.title, domain || "External source"),
    url,
    domain,
    content,
    publishedAt: parsePublishedAt(row.published_date),
    provider,
  };
}

async function tavilyRequest(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WebSearchError(
      error instanceof Error && error.name === "TimeoutError"
        ? "The web research provider timed out. Try again in a moment."
        : "Could not reach the web research provider. Check the network and try again.",
      504,
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const record =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const detail =
      record && typeof record.detail === "string"
        ? record.detail
        : record && typeof record.error === "string"
          ? record.error
          : null;

    throw new WebSearchError(
      response.status === 401 || response.status === 403
        ? "The web research provider rejected TAVILY_API_KEY. Check the key and try again."
        : detail
          ? `The web research provider failed: ${detail}`
          : `The web research provider failed with status ${response.status}.`,
      response.status === 429 ? 503 : 502,
    );
  }

  return payload;
}

/**
 * Search the public web and return clean, deduped page text. Tavily returns
 * page content alongside each result, so there is no second scrape step.
 */
export async function searchWeb(
  query: string,
  maxResults = 6,
): Promise<WebSource[]> {
  const payload = await tavilyRequest(TAVILY_SEARCH_URL, {
    api_key: tavilyKey(),
    query,
    search_depth: "advanced",
    topic: "general",
    include_answer: false,
    include_raw_content: true,
    max_results: Math.min(Math.max(maxResults, 1), MAX_RESULTS),
  });

  const record =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const results = Array.isArray(record?.results) ? record.results : [];
  const seen = new Set<string>();
  const sources: WebSource[] = [];

  for (const result of results) {
    const source = toWebSource(result, "tavily");

    if (!source || seen.has(source.url)) {
      continue;
    }

    seen.add(source.url);
    sources.push(source);
  }

  return sources;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch a public page with manual redirect handling so a redirect cannot turn
 * a validated public URL into a request to localhost or a private network.
 */
async function fetchPublicPage(url: string): Promise<Response> {
  let current = url;

  for (let hop = 0; hop < 4; hop += 1) {
    if (!isPublicHttpUrl(current)) {
      throw new WebSearchError(
        "That URL redirects to a private or unsupported address.",
        422,
      );
    }

    let response: Response;

    try {
      response = await fetch(current, {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "User-Agent":
            "memex.ai research bot (+https://memex.ai; contact: support@memex.ai)",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new WebSearchError(
        error instanceof Error && error.name === "TimeoutError"
          ? "Fetching that URL timed out. Try a different source."
          : "Could not fetch that URL. Check the address and try again.",
        504,
      );
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      throw new WebSearchError(
        "That URL redirected without a destination. Try a different source.",
        422,
      );
    }

    try {
      current = new URL(location, current).toString();
    } catch {
      throw new WebSearchError(
        "That URL redirected to an invalid address. Try a different source.",
        422,
      );
    }
  }

  throw new WebSearchError(
    "That URL redirected too many times. Try a different source.",
    422,
  );
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, MAX_RAW_BYTES);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;

      if (received > MAX_RAW_BYTES) {
        await reader.cancel();
        break;
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function fetchPage(url: string): Promise<WebSource> {
  const response = await fetchPublicPage(url);

  if (!response.ok) {
    throw new WebSearchError(
      `That URL returned status ${response.status}. Try a different source.`,
      response.status === 404 ? 422 : 502,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (
    !contentType.includes("text/html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("application/xhtml")
  ) {
    throw new WebSearchError(
      "That URL is not a readable web page. Try an article or documentation URL.",
      422,
    );
  }

  const raw = await readLimitedText(response);
  const content = cleanContent(
    contentType.includes("text/plain") ? raw : htmlToText(raw),
  );

  if (content.length < 120) {
    throw new WebSearchError(
      "That page did not contain enough readable text. Try a different source.",
      422,
    );
  }

  const finalUrl = normalizeSourceUrl(response.url || url);

  if (!finalUrl) {
    throw new WebSearchError("That URL is not a public web page.", 422);
  }

  const domain = sourceDomainOf(finalUrl);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);

  return {
    title: cleanTitle(
      titleMatch ? htmlToText(titleMatch[1]) : "",
      domain || "External source",
    ),
    url: finalUrl,
    domain,
    content,
    publishedAt: null,
    provider: "direct",
  };
}

/** Extract one URL for manual research, preferring Tavily's clean extractor. */
export async function extractUrl(rawUrl: string): Promise<WebSource> {
  const url = normalizeSourceUrl(rawUrl);

  if (!url) {
    throw new WebSearchError(
      "Enter a public http(s) URL. Local and private addresses are not supported.",
      422,
    );
  }

  if (!isWebSearchConfigured()) {
    return fetchPage(url);
  }

  try {
    const payload = await tavilyRequest(TAVILY_EXTRACT_URL, {
      api_key: tavilyKey(),
      urls: [url],
      extract_depth: "advanced",
    });
    const record =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : null;
    const results = Array.isArray(record?.results) ? record.results : [];
    const source = toWebSource(results[0], "tavily");

    if (source) {
      return source;
    }
  } catch (error) {
    // Fall back to a direct fetch when extraction is unavailable. Search and
    // generation errors are still surfaced separately.
    if (!(error instanceof WebSearchError)) {
      throw error;
    }
  }

  return fetchPage(url);
}
