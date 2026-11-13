import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { strToU8, zipSync } from "fflate";

import {
  decodeXmlEntities,
  extractPptxSlides,
  extractPptxText,
  PptxError,
} from "./pptx.ts";

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function shape(paragraphs: string[], placeholder?: string) {
  const ph = placeholder ? `<p:nvPr><p:ph type="${placeholder}"/></p:nvPr>` : "<p:nvPr/>";
  return (
    `<p:sp><p:nvSpPr>${ph}</p:nvSpPr><p:txBody>` +
    paragraphs.map((runs) => `<a:p>${runs}</a:p>`).join("") +
    "</p:txBody></p:sp>"
  );
}

function part(body: string, root = "p:sld") {
  return `<?xml version="1.0" encoding="UTF-8"?><${root} ${NS}><p:cSld><p:spTree>${body}</p:spTree></p:cSld></${root}>`;
}

/** A two-slide deck whose file numbering is the reverse of its slide order. */
function deck(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "ppt/presentation.xml": strToU8(
      `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId1" Type="${REL}/slide" Target="slides/slide1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide2.xml"/></Relationships>`,
    ),
    "ppt/slides/slide2.xml": strToU8(
      part(
        shape(["<a:r><a:t>Routing &amp; Allocation</a:t></a:r>"], "title") +
          shape([
            '<a:r><a:rPr lang="en-US"/><a:t>Small models </a:t></a:r><a:r><a:t>first</a:t></a:r>',
            "<a:r><a:t>Line one</a:t></a:r><a:br/><a:r><a:t>line two</a:t></a:r>",
          ]) +
          shape(["<a:fld><a:t>7</a:t></a:fld>"], "sldNum"),
      ),
    ),
    "ppt/slides/_rels/slide2.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId9" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide4.xml"/></Relationships>`,
    ),
    "ppt/notesSlides/notesSlide4.xml": strToU8(
      part(
        shape([], "sldImg") +
          shape(["<a:r><a:t>Mention the &#8220;cost&#8221; numbers</a:t></a:r>"], "body") +
          shape(["<a:r><a:t>1</a:t></a:r>"], "sldNum"),
        "p:notes",
      ),
    ),
    "ppt/slides/slide1.xml": strToU8(part(shape(["<a:r><a:t>Questions?</a:t></a:r>"]))),
    "ppt/media/image1.png": new Uint8Array([1, 2, 3]),
  });
}

describe("extractPptxSlides", () => {
  it("reads slides in presentation order with their speaker notes", () => {
    const slides = extractPptxSlides(deck());

    assert.deepEqual(slides, [
      {
        number: 1,
        text: "Routing & Allocation\nSmall models first\nLine one\nline two",
        notes: "Mention the “cost” numbers",
      },
      { number: 2, text: "Questions?", notes: "" },
    ]);
  });

  it("formats slides as readable text", () => {
    assert.equal(
      extractPptxText(deck()),
      "Slide 1\nRouting & Allocation\nSmall models first\nLine one\nline two\n" +
        "Speaker notes:\nMention the “cost” numbers\n\nSlide 2\nQuestions?",
    );
  });

  it("explains legacy .ppt files instead of returning noise", () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
    assert.throws(() => extractPptxSlides(ole), PptxError);
  });

  it("rejects files that are not zip archives", () => {
    assert.throws(() => extractPptxSlides(strToU8("plain text")), /not a valid/);
  });
});

describe("decodeXmlEntities", () => {
  it("decodes named and numeric entities", () => {
    assert.equal(decodeXmlEntities("a &lt;b&gt; &amp; &#233; &#x2014; &apos;"), "a <b> & é — '");
  });
});
