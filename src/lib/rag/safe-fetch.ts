import "server-only";

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

import { bareHostname, isIpLiteral, isPublicIpAddress } from "@/lib/rag/url";

/**
 * One HTTP GET to a public address, for fetching user-supplied URLs.
 *
 * `fetch` resolves DNS itself, so a hostname check before calling it cannot
 * stop a domain that points at 127.0.0.1 or 169.254.169.254, nor DNS
 * rebinding between the check and the connect. Here the socket's own DNS
 * lookup is replaced with one that rejects any non-public address, so the
 * address that is checked is the address that is connected to.
 */

export class UnsafeAddressError extends Error {
  constructor(message = "That URL points to a private or unsupported address.") {
    super(message);
    this.name = "UnsafeAddressError";
  }
}

export type PublicResponse = {
  status: number;
  location: string | null;
  contentType: string;
  /** Decoded body, truncated at `maxBytes`. Empty unless a 2xx text response. */
  body: string;
};

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

const publicOnlyLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
) => {
  dns.lookup(
    hostname,
    { ...options, all: true, verbatim: true },
    (error, addresses) => {
      if (error) {
        callback(error, "");
        return;
      }

      const list = addresses as dns.LookupAddress[];

      // Reject the host if any record is private, so a mixed answer cannot be
      // used to reach an internal address on a later connection attempt.
      if (
        list.length === 0 ||
        list.some((entry) => !isPublicIpAddress(entry.address))
      ) {
        callback(Object.assign(new UnsafeAddressError(), { code: "EUNSAFEADDR" }), "");
        return;
      }

      if (options.all) {
        callback(null, list);
      } else {
        callback(null, list[0].address, list[0].family);
      }
    },
  );
}) as unknown as LookupFunction;

function decodedStream(response: http.IncomingMessage): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();

  if (encoding === "gzip" || encoding === "x-gzip") {
    return response.pipe(zlib.createGunzip());
  }

  if (encoding === "deflate") {
    return response.pipe(zlib.createInflate());
  }

  if (encoding === "br") {
    return response.pipe(zlib.createBrotliDecompress());
  }

  return response;
}

async function readLimited(stream: Readable, maxBytes: number): Promise<string> {
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  // The byte cap applies after decompression, so a small compressed
  // response cannot expand into an unbounded body.
  for await (const chunk of stream) {
    const bytes = chunk as Buffer;
    const remaining = maxBytes - received;

    if (bytes.byteLength >= remaining) {
      text += decoder.decode(bytes.subarray(0, remaining), { stream: true });
      stream.destroy();
      break;
    }

    received += bytes.byteLength;
    text += decoder.decode(bytes, { stream: true });
  }

  return text + decoder.decode();
}

export async function getPublic(
  target: string,
  {
    headers,
    signal,
    maxBytes,
  }: { headers: Record<string, string>; signal: AbortSignal; maxBytes: number },
): Promise<PublicResponse> {
  const url = new URL(target);
  const host = bareHostname(url);

  // Sockets skip DNS for IP literals, so check those here.
  if (isIpLiteral(host) && !isPublicIpAddress(host)) {
    throw new UnsafeAddressError();
  }

  const client = url.protocol === "https:" ? https : http;

  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const request = client.request(url, {
      method: "GET",
      headers: { ...headers, "Accept-Encoding": "gzip, deflate, br" },
      lookup: publicOnlyLookup,
      // A fresh agent per request: never reuse a pooled socket that was
      // opened under a different DNS answer.
      agent: false,
      signal,
    });

    request.on("response", resolve);
    request.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "EUNSAFEADDR" || error instanceof UnsafeAddressError
          ? new UnsafeAddressError()
          : error,
      );
    });
    request.end();
  });

  const status = response.statusCode ?? 0;
  const location =
    typeof response.headers.location === "string" ? response.headers.location : null;
  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();

  const readable =
    status >= 200 &&
    status < 300 &&
    /text\/html|text\/plain|application\/xhtml/.test(contentType);

  // Redirects, errors, and non-text bodies are never read.
  if (!readable) {
    response.resume();
    return { status, location, contentType, body: "" };
  }

  return {
    status,
    location,
    contentType,
    body: await readLimited(decodedStream(response), maxBytes),
  };
}
