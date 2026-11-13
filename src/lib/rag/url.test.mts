import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPublicHttpUrl,
  normalizeSourceUrl,
  sourceDomainOf,
} from "./url.ts";

describe("web source URLs", () => {
  it("normalizes public URLs for dedupe and display", () => {
    assert.equal(
      normalizeSourceUrl(
        "HTTPS://WWW.Example.com:443/article/?q=1#section",
      ),
      "https://example.com/article/?q=1",
    );
    assert.equal(normalizeSourceUrl("https://example.com/"), "https://example.com");
  });

  it("rejects local and private targets", () => {
    assert.equal(isPublicHttpUrl("http://localhost:3000/admin"), false);
    assert.equal(isPublicHttpUrl("http://127.0.0.1/"), false);
    assert.equal(isPublicHttpUrl("http://10.0.0.4/"), false);
    assert.equal(isPublicHttpUrl("http://172.20.1.1/"), false);
    assert.equal(isPublicHttpUrl("http://192.168.1.2/"), false);
    assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
    assert.equal(isPublicHttpUrl("https://example.com/article"), true);
  });

  it("extracts a display domain without www", () => {
    assert.equal(
      sourceDomainOf("https://www.example.com/article"),
      "example.com",
    );
  });
});
