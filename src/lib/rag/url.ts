/** URL helpers shared by web retrieval and source ingestion. */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[::1\]$/,
  /^\[fc/i,
  /^\[fd/i,
  /^\[fe80:/i,
];

function isPrivateIpv4(host: string): boolean {
  const match = /^172\.(\d{1,3})\./.exec(host);

  if (!match) {
    return false;
  }

  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

/** Block obvious SSRF targets while allowing normal public web pages. */
export function isPublicHttpUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (
    PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host)) ||
    isPrivateIpv4(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  return true;
}

/** Canonical URL used for display, dedupe, and `documents.source_key`. */
export function normalizeSourceUrl(value: string): string | null {
  if (!isPublicHttpUrl(value)) {
    return null;
  }

  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.protocol = url.protocol.toLowerCase();

  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  if (url.pathname === "/" && !url.search) {
    return `${url.origin}`;
  }

  return url.toString();
}

export function sourceDomainOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
