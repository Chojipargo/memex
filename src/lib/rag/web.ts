import "server-only";

import { getPublic, UnsafeAddressError } from "@/lib/rag/safe-fetch";
import type { WebSource } from "@/lib/rag/types";
import {
  isPublicHttpUrl,
  normalizeSourceUrl,
  sourceDomainOf,
} from "@/lib/rag/url";
import type { TrailDeadline } from "@/lib/trails/timeouts";

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

const OUT_OF_TIME =
  "Web research ran out of time. Try again, or ask a more specific question.";

/** Refuse to start a request that cannot finish inside the route's budget. */
function requireTime(deadline: TrailDeadline): void {
  if (!deadline.canStartRequest(2_000)) {
    throw new WebSearchError(OUT_OF_TIME, 504);
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
  deadline: TrailDeadline,
): Promise<unknown> {
  requireTime(deadline);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: deadline.timeoutSignal(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WebSearchError(
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
        ? deadline.canStartRequest(0)
          ? "The web research provider timed out. Try again in a moment."
          : OUT_OF_TIME
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
  deadline: TrailDeadline,
  maxResults = 6,
): Promise<WebSource[]> {
  const payload = await tavilyRequest(
    TAVILY_SEARCH_URL,
    {
      api_key: tavilyKey(),
      query,
      search_depth: "advanced",
      topic: "general",
      include_answer: false,
      include_raw_content: true,
      max_results: Math.min(Math.max(maxResults, 1), MAX_RESULTS),
    },
    deadline,
  );

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
const MAX_REDIRECTS = 4;

type PageResponse = Awaited<ReturnType<typeof getPublic>>;

/**
 * Fetch a public page, following redirects by hand so every hop is checked:
 * syntactically here, and against its resolved IP inside `getPublic`.
 */
async function fetchPage(url: string, deadline: TrailDeadline): Promise<WebSource> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isPublicHttpUrl(current)) {
      throw new WebSearchError(
        "That URL points to a private or unsupported address.",
        422,
      );
    }

    requireTime(deadline);

    let response: PageResponse;

    try {
      response = await getPublic(current, {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "User-Agent": "memex.ai research bot",
        },
        signal: deadline.timeoutSignal(REQUEST_TIMEOUT_MS),
        maxBytes: MAX_RAW_BYTES,
      });
    } catch (error) {
      if (error instanceof UnsafeAddressError) {
        throw new WebSearchError(error.message, 422);
      }

      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");

      throw new WebSearchError(
        aborted
          ? deadline.canStartRequest(0)
            ? "Fetching that URL timed out. Try a different source."
            : OUT_OF_TIME
          : "Could not fetch that URL. Check the address and try again.",
        504,
      );
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return toPageSource(response, current);
    }

    if (!response.location) {
      throw new WebSearchError(
        "That URL redirected without a destination. Try a different source.",
        422,
      );
    }

    try {
      current = new URL(response.location, current).toString();
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

function toPageSource(response: PageResponse, pageUrl: string): WebSource {
  if (response.status < 200 || response.status >= 300) {
    throw new WebSearchError(
      `That URL returned status ${response.status}. Try a different source.`,
      response.status === 404 ? 422 : 502,
    );
  }

  const { contentType } = response;

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

  const raw = response.body;
  const content = cleanContent(
    contentType.includes("text/plain") ? raw : htmlToText(raw),
  );

  if (content.length < 120) {
    throw new WebSearchError(
      "That page did not contain enough readable text. Try a different source.",
      422,
    );
  }

  const finalUrl = normalizeSourceUrl(pageUrl);

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
export async function extractUrl(
  rawUrl: string,
  deadline: TrailDeadline,
): Promise<WebSource> {
  const url = normalizeSourceUrl(rawUrl);

  if (!url) {
    throw new WebSearchError(
      "Enter a public http(s) URL. Local and private addresses are not supported.",
      422,
    );
  }

  if (!isWebSearchConfigured()) {
    return fetchPage(url, deadline);
  }

  try {
    const payload = await tavilyRequest(
      TAVILY_EXTRACT_URL,
      {
        api_key: tavilyKey(),
        urls: [url],
        extract_depth: "advanced",
      },
      deadline,
    );
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
    // Fall back to a direct fetch when extraction is unavailable, unless the
    // budget is already spent. Search and generation errors are surfaced
    // separately.
    if (!(error instanceof WebSearchError) || error.message === OUT_OF_TIME) {
      throw error;
    }
  }

  return fetchPage(url, deadline);
}
