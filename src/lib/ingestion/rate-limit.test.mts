import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EmbeddingCache } from "./embedding-cache.ts";
import {
  parseDurationMs,
  parseRetryAfterHeader,
  readRateLimitInfo,
  retryDelayMs,
} from "./rate-limit.ts";

// Shape of a Gemini API 429 body.
const perMinute = {
  error: {
    code: 429,
    message: "You exceeded your current quota.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier" }],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" },
    ],
  },
};

const perDay = {
  error: {
    code: 429,
    message: "You exceeded your current quota.",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "EmbedContentRequestsPerDayPerProjectPerModel-FreeTier" }],
      },
    ],
  },
};

describe("readRateLimitInfo", () => {
  it("reads Google's retry delay from a per-minute limit", () => {
    assert.deepEqual(readRateLimitInfo(perMinute), { retryAfterMs: 17_000, daily: false });
  });

  it("recognises a daily quota", () => {
    assert.equal(readRateLimitInfo(perDay).daily, true);
  });

  it("falls back to the Retry-After header", () => {
    assert.equal(readRateLimitInfo({ error: { code: 429 } }, "3").retryAfterMs, 3000);
  });

  it("copes with bodies that aren't Google errors", () => {
    assert.deepEqual(readRateLimitInfo(null), { retryAfterMs: null, daily: false });
    assert.deepEqual(readRateLimitInfo("busy"), { retryAfterMs: null, daily: false });
  });
});

describe("durations", () => {
  it("parses protobuf durations and Retry-After seconds", () => {
    assert.equal(parseDurationMs("17s"), 17_000);
    assert.equal(parseDurationMs("0.5s"), 500);
    assert.equal(parseDurationMs("17"), null);
    assert.equal(parseRetryAfterHeader("2"), 2000);
    assert.equal(parseRetryAfterHeader("Wed, 21 Oct 2026 07:28:00 GMT"), null);
  });
});

describe("retryDelayMs", () => {
  it("waits as long as Google asked, plus a margin", () => {
    assert.equal(retryDelayMs(1, { retryAfterMs: 17_000, daily: false }), 17_250);
  });

  it("backs off with jitter when no delay was given", () => {
    const low = retryDelayMs(2, { retryAfterMs: null, daily: false }, () => 0);
    const high = retryDelayMs(2, { retryAfterMs: null, daily: false }, () => 1);
    assert.equal(low, 1500);
    assert.equal(high, 2500);
  });
});

describe("EmbeddingCache", () => {
  it("returns cached vectors until they expire", () => {
    let now = 0;
    const cache = new EmbeddingCache(10, 1000, () => now);
    cache.set("q", [1, 2]);
    assert.deepEqual(cache.get("q"), [1, 2]);
    now = 1000;
    assert.equal(cache.get("q"), null);
  });

  it("evicts the least recently used entry", () => {
    const cache = new EmbeddingCache(2, 60_000);
    cache.set("a", [1]);
    cache.set("b", [2]);
    cache.get("a");
    cache.set("c", [3]);
    assert.deepEqual(cache.get("a"), [1]);
    assert.equal(cache.get("b"), null);
    assert.equal(cache.size, 2);
  });
});
