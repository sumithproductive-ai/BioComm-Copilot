// Citation provenance shared by every research agent. A citation is accepted
// only if its exact page appeared in a real tool or web_search result during
// this run. An earlier hostname-level check let an invented path on a real
// host through (any made-up PubMed URL passed once PubMed had returned any
// result). This proves the page was seen, not that it supports the claim;
// claim support is measured separately by evals/.
import type Anthropic from "@anthropic-ai/sdk";

const TRACKING_PARAM = /^(utm_.*|gclid|fbclid|mc_cid|mc_eid|ref_src)$/i;

// Ignores differences that don't change the page: scheme, www, fragment,
// trailing slash, host case and tracking parameters. Path case and meaningful
// query parameters are kept, since those can identify a different document.
export function normalizeUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, "");
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  return `${host}${path}${query}`;
}

function isWebSearchToolResultBlock(
  block: Anthropic.ContentBlock
): block is Anthropic.WebSearchToolResultBlock {
  return block.type === "web_search_tool_result";
}

export class SourceLedger {
  private readonly seen = new Set<string>();

  private add(url: string): void {
    const normalized = normalizeUrl(url);
    if (normalized) this.seen.add(normalized);
  }

  // web_search runs server-side, so its results arrive in the model response
  // rather than through this codebase's own tool loop.
  addWebSearchResults(content: Anthropic.ContentBlock[]): void {
    for (const block of content) {
      if (!isWebSearchToolResultBlock(block) || !Array.isArray(block.content)) continue;
      for (const result of block.content) this.add(result.url);
    }
  }

  // Records every sourceUrl in a structured tool's result, at any depth.
  addToolResult(result: unknown): void {
    if (Array.isArray(result)) {
      for (const item of result) this.addToolResult(item);
    } else if (result && typeof result === "object") {
      for (const [key, value] of Object.entries(result)) {
        if (key === "sourceUrl" && typeof value === "string") this.add(value);
        else this.addToolResult(value);
      }
    }
  }

  findUnverified(urls: string[]): string[] {
    return urls.filter((url) => {
      const normalized = normalizeUrl(url);
      return !normalized || !this.seen.has(normalized);
    });
  }
}
