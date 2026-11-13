/**
 * URL helpers shared by web retrieval and source ingestion.
 *
 * `isPublicHttpUrl` is a syntactic check: it rejects private, loopback,
 * link-local, and other special-purpose IP literals in every spelling the
 * WHATWG URL parser accepts, plus local-only host names. It cannot see what a
 * domain resolves to, so server-side fetches must also check resolved
 * addresses with `isPublicIpAddress` at connect time (see `safe-fetch.ts`).
 */

/** Host suffixes that only resolve inside private networks. */
const PRIVATE_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
  ".home.arpa",
];

/** [first address, prefix length] for IPv4 ranges that are not the public internet. */
const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including broadcast
];

function parseIpv4(value: string): number | null {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return null;
  }

  let result = 0;

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const octet = Number(part);

    if (octet > 255) {
      return null;
    }

    result = result * 256 + octet;
  }

  return result;
}

function isBlockedIpv4(address: number): boolean {
  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => {
    const start = parseIpv4(base) ?? 0;
    const size = 2 ** (32 - prefix);
    return address >= start && address < start + size;
  });
}

/** Parse an IPv6 address (no brackets, no zone) into eight 16-bit groups. */
function parseIpv6(value: string): number[] | null {
  let text = value.toLowerCase();
  let tail: number[] = [];

  // A trailing dotted IPv4 part (::ffff:1.2.3.4) becomes two groups.
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);

  if (dotted) {
    const ipv4 = parseIpv4(dotted[2]);

    if (ipv4 === null) {
      return null;
    }

    tail = [Math.floor(ipv4 / 65536), ipv4 % 65536];
    text = dotted[1].endsWith("::") ? dotted[1] : dotted[1].slice(0, -1);
  }

  const halves = text.split("::");

  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (part: string) =>
    part === "" ? [] : part.split(":").map((group) =>
      /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN,
    );

  const head = parseGroups(halves[0]);
  const rest = halves.length === 2 ? parseGroups(halves[1]) : [];

  if ([...head, ...rest].some(Number.isNaN)) {
    return null;
  }

  const explicit = head.length + rest.length + tail.length;

  if (halves.length === 2) {
    if (explicit > 7) {
      return null;
    }

    return [...head, ...new Array<number>(8 - explicit).fill(0), ...rest, ...tail];
  }

  return explicit === 8 ? [...head, ...tail] : null;
}

function embeddedIpv4(groups: number[], from: number): number {
  return groups[from] * 65536 + groups[from + 1];
}

function isBlockedIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = groups;
  const firstSixZero = groups.slice(0, 6).every((group) => group === 0);

  // :: (unspecified), ::1 (loopback), and IPv4-compatible ::a.b.c.d.
  if (firstSixZero) {
    const ipv4 = embeddedIpv4(groups, 6);
    return ipv4 <= 1 || isBlockedIpv4(ipv4);
  }

  // IPv4-mapped ::ffff:a.b.c.d and IPv4-translated ::ffff:0:a.b.c.d.
  if (
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 &&
    ((g4 === 0 && g5 === 0xffff) || (g4 === 0xffff && g5 === 0))
  ) {
    return isBlockedIpv4(embeddedIpv4(groups, 6));
  }

  // NAT64 64:ff9b::/96 and 64:ff9b:1::/48 carry an IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b) {
    return g2 === 1 || isBlockedIpv4(embeddedIpv4(groups, 6));
  }

  // 6to4 2002::/16 embeds an IPv4 address in groups 1-2.
  if (g0 === 0x2002) {
    return isBlockedIpv4(embeddedIpv4(groups, 1));
  }

  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (g0 & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (g0 & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
    (g0 & 0xff00) === 0xff00 || // multicast ff00::/8
    (g0 === 0x2001 && g1 === 0x0db8) || // documentation 2001:db8::/32
    (g0 === 0x2001 && g1 < 0x0200) || // IETF special purpose 2001::/23 (Teredo, ORCHID, ...)
    g0 === 0x0100 // discard-only 100::/64
  );
}

/**
 * True only for globally routable unicast addresses. Unparseable input is
 * treated as not public.
 */
export function isPublicIpAddress(value: string): boolean {
  const address = value.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const ipv4 = parseIpv4(address);

  if (ipv4 !== null) {
    return !isBlockedIpv4(ipv4);
  }

  const ipv6 = address.includes(":") ? parseIpv6(address) : null;
  return ipv6 !== null && !isBlockedIpv6(ipv6);
}

/** True when the host is an IP literal (URL hostnames keep IPv6 brackets). */
export function isIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  return parseIpv4(bare) !== null || (bare.includes(":") && parseIpv6(bare) !== null);
}

/** Lowercase host name without IPv6 brackets or trailing root dots. */
export function bareHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

/** Block SSRF targets while allowing normal public web pages. */
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

  const host = bareHostname(url);

  if (!host) {
    return false;
  }

  // The URL parser already normalizes decimal, octal, and hex IPv4 forms
  // (http://2130706433, http://0x7f.1) to dotted quads.
  if (isIpLiteral(host)) {
    return isPublicIpAddress(host);
  }

  // Single-label names ("localhost", "metadata", "intranet") resolve through
  // local search domains, never to the public web.
  if (!host.includes(".")) {
    return false;
  }

  return !PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Canonical URL used for display, dedupe, and `documents.source_key`. */
export function normalizeSourceUrl(value: string): string | null {
  if (!isPublicHttpUrl(value)) {
    return null;
  }

  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
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
    return bareHostname(new URL(value)).replace(/^www\./, "");
  } catch {
    return "";
  }
}
