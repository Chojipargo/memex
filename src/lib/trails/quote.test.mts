import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findOverlap,
  fromCodePointIndex,
  locateQuote,
  toCodePointIndex,
  trimOverlap,
} from "./quote.ts";

const chunk =
  "Bush imagined a desk called the memex.\nIt stored   books, records and\n" +
  "communications, “mechanized so that it may be consulted with exceeding " +
  "speed and flexibility.” The essential feature is associative indexing — " +
  "any item may be caused to select another.";

describe("locateQuote", () => {
  it("matches across line breaks and repeated spaces", () => {
    const quote = "It stored books, records and communications,";
    const found = locateQuote(chunk, quote);

    assert.ok(found);
    assert.equal(
      chunk.slice(found.start, found.end),
      "It stored   books, records and\ncommunications,",
    );
  });

  it("matches straight quotes and hyphens against curly quotes and dashes", () => {
    const quote =
      '"mechanized so that it may be consulted with exceeding speed and flexibility." ' +
      "The essential feature is associative indexing - any item";
    const found = locateQuote(chunk, quote);

    assert.ok(found);
    assert.ok(chunk.slice(found.start, found.end).startsWith("“mechanized"));
    assert.ok(chunk.slice(found.start, found.end).endsWith("any item"));
  });

  it("ignores soft hyphens in the chunk", () => {
    const text = "The associa­tive trail is the heart of the device.";
    const found = locateQuote(text, "The associative trail is the heart");

    assert.ok(found);
    assert.equal(found.start, 0);
  });

  it("returns null for a quote that is not in the chunk", () => {
    assert.equal(
      locateQuote(chunk, "Bush believed computers would replace libraries entirely."),
      null,
    );
  });

  it("returns null for an ambiguous quote", () => {
    const repeated =
      "The trail is the unit of thought. Later he wrote it again: " +
      "the trail is the unit of thought. The trail is the unit of thought.";
    assert.equal(locateQuote(repeated, "The trail is the unit of thought."), null);
  });

  it("rejects quotes that are too short or too long", () => {
    assert.equal(locateQuote(chunk, "the memex."), null);
    assert.equal(locateQuote("a".repeat(2000), "a".repeat(700)), null);
  });
});

describe("trimOverlap", () => {
  it("removes the repeated prefix from the next chunk", () => {
    const previous =
      "First idea goes here. The overlap sentence repeats at the seam.";
    const current =
      "The overlap  sentence repeats\nat the seam. New material starts now.";

    assert.equal(trimOverlap(previous, current), "New material starts now.");

    const overlap = findOverlap(previous, current);
    assert.ok(overlap);
    assert.equal(previous.slice(0, overlap.previousEnd), "First idea goes here. ");
  });

  it("returns the text unchanged when there is no overlap", () => {
    assert.equal(
      trimOverlap("Completely different words.", "Nothing shared with that one."),
      "Nothing shared with that one.",
    );
  });
});

describe("code point offsets", () => {
  it("round-trips offsets around astral characters", () => {
    const text = "Emoji 🧠 then the quote begins here.";
    const utf16 = text.indexOf("then");
    const points = toCodePointIndex(text, utf16);

    assert.equal(points, utf16 - 1);
    assert.equal(fromCodePointIndex(text, points), utf16);
  });
});
