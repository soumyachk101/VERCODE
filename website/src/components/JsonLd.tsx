// The JSON-LD inliner — the 6-line server component.
//
// Inlines a JSON-LD block array as a <script type="application/ld+json">
// via dangerouslySetInnerHTML. No client hydration; the static export
// writes the <script> into the HTML verbatim (the crawler + the
// answer engine both read it, STRUCTURED_DATA.md §1's rule that the
// JSON-LD is the quotable artifact).

import { type JsonLdBlock } from "@/lib/schema-generator.js";

export function JsonLd({ blocks }: { blocks: JsonLdBlock[] }) {
  const json = JSON.stringify(blocks);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
