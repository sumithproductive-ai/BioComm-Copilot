import assert from "node:assert/strict";
import { test } from "node:test";
import { SourceLedger, normalizeUrl } from "../lib/agents/tools/source-provenance";

test("rejects an invented path on a host the run really searched", () => {
  const sources = new SourceLedger();
  sources.addToolResult([{ pmid: "111", sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/111/" }]);
  assert.deepEqual(sources.findUnverified(["https://pubmed.ncbi.nlm.nih.gov/999/"]), [
    "https://pubmed.ncbi.nlm.nih.gov/999/",
  ]);
});

test("accepts the same page despite cosmetic URL differences", () => {
  const sources = new SourceLedger();
  sources.addToolResult({ nested: [{ sourceUrl: "https://www.example.com/a/" }] });
  assert.deepEqual(sources.findUnverified(["http://example.com/a?utm_source=x#top"]), []);
});

test("records web_search results", () => {
  const sources = new SourceLedger();
  sources.addWebSearchResults([
    { type: "web_search_tool_result", tool_use_id: "t", content: [{ type: "web_search_result", url: "https://fda.gov/x", title: "", encrypted_content: "", page_age: null }] },
  ] as never);
  assert.deepEqual(sources.findUnverified(["https://www.fda.gov/x"]), []);
});

test("keeps query parameters that identify a document, and rejects bad URLs", () => {
  assert.notEqual(normalizeUrl("https://a.com/doc?id=1"), normalizeUrl("https://a.com/doc?id=2"));
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.deepEqual(new SourceLedger().findUnverified(["not a url"]), ["not a url"]);
});
