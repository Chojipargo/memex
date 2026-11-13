/** File-name checks for PowerPoint imports, kept apart from the zip reader. */

export function isPptxName(name: string): boolean {
  return /\.(pptx|pptm|ppsx|potx)$/i.test(name);
}

/** Pre-2007 binary decks, which the browser importer cannot read. */
export function isLegacyPptName(name: string): boolean {
  return /\.(ppt|pps|pot)$/i.test(name);
}
