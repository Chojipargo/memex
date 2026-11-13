import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { provenanceOf } from "./types.ts";

describe("provenanceOf", () => {
  it("labels all-library trails", () => {
    assert.equal(provenanceOf(["library", "library"]), "library");
    assert.equal(provenanceOf([]), "library");
  });

  it("labels all-web trails", () => {
    assert.equal(provenanceOf(["web", "web"]), "web");
  });

  it("labels mixed trails as hybrid", () => {
    assert.equal(provenanceOf(["library", "web"]), "hybrid");
  });
});
