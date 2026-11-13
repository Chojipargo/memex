import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPublicHttpUrl,
  isPublicIpAddress,
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
    assert.equal(normalizeSourceUrl("https://example.com./a"), "https://example.com/a");
  });

  it("rejects local and private targets", () => {
    for (const url of [
      "http://localhost:3000/admin",
      "http://127.0.0.1/",
      "http://10.0.0.4/",
      "http://172.20.1.1/",
      "http://192.168.1.2/",
      "file:///etc/passwd",
    ]) {
      assert.equal(isPublicHttpUrl(url), false, url);
    }

    assert.equal(isPublicHttpUrl("https://example.com/article"), true);
  });

  it("rejects the reported bypasses", () => {
    for (const url of [
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:169.254.169.254]/latest/meta-data/",
      "http://[::]/",
      "http://localhost./",
      "http://api.localhost/",
      "http://100.64.0.1/",
      "http://100.127.255.254/",
    ]) {
      assert.equal(isPublicHttpUrl(url), false, url);
    }
  });

  it("rejects other spellings of internal addresses", () => {
    for (const url of [
      "http://2130706433/", // 127.0.0.1 as a decimal integer
      "http://0x7f.1/", // hex shorthand
      "http://0177.0.0.1/", // octal
      "http://[::1]/",
      "http://[0:0:0:0:0:ffff:7f00:1]/",
      "http://[::127.0.0.1]/", // IPv4-compatible
      "http://[64:ff9b::a9fe:a9fe]/", // NAT64 of 169.254.169.254
      "http://[2002:a9fe:a9fe::]/", // 6to4 of 169.254.169.254
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://0.0.0.0/",
      "http://metadata/", // single-label name
      "http://metadata.google.internal/",
      "http://printer.local/",
      "http://router.home.arpa/",
      "http://user:pass@example.com/",
    ]) {
      assert.equal(isPublicHttpUrl(url), false, url);
    }
  });

  it("allows public IP literals", () => {
    assert.equal(isPublicHttpUrl("http://93.184.216.34/"), true);
    assert.equal(isPublicHttpUrl("http://[2606:4700:4700::1111]/"), true);
  });

  it("extracts a display domain without www", () => {
    assert.equal(
      sourceDomainOf("https://www.example.com/article"),
      "example.com",
    );
  });
});

describe("isPublicIpAddress", () => {
  it("classifies resolved addresses", () => {
    assert.equal(isPublicIpAddress("8.8.8.8"), true);
    assert.equal(isPublicIpAddress("2001:4860:4860::8888"), true);

    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "100.64.1.1",
      "169.254.169.254",
      "172.31.255.255",
      "192.168.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
      "fc00::1",
      "fe80::1%eth0",
      "ff02::1",
      "not-an-ip",
    ]) {
      assert.equal(isPublicIpAddress(address), false, address);
    }
  });
});
