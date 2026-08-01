// Shared provenance check used by every research agent that has a
// web_search tool — generalizes clinical-research.ts's realNctIds pattern
// (track real data as it comes back from tool results, reject a
// submit_findings call that cites anything not seen this run) to arbitrary
// citation URLs. Hostname-level, not exact-URL-level: NCT IDs are compact
// exact identifiers so exact matching makes sense there, but URLs vary in
// ways that don't indicate fabrication (tracking params, equivalent paths).
import type Anthropic from "@anthropic-ai/sdk";

function isWebSearchToolResultBlock(
  block: Anthropic.ContentBlock
): block is Anthropic.WebSearchToolResultBlock {
  return block.type === "web_search_tool_result";
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// web_search is a server-side (Anthropic-hosted) tool — its results arrive
// as web_search_tool_result blocks in the same response as the tool_use
// block, never dispatched through this codebase's own tool-call loop (see
// the "nothing to do here" comment in every agent that uses it).
export function extractWebSearchHostnames(content: Anthropic.ContentBlock[]): string[] {
  const hostnames: string[] = [];
  for (const block of content) {
    if (!isWebSearchToolResultBlock(block) || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      const host = hostnameOf(result.url);
      if (host) hostnames.push(host);
    }
  }
  return hostnames;
}

export function findUnverifiedUrls(urls: string[], knownHostnames: Set<string>): string[] {
  return urls.filter((url) => {
    const host = hostnameOf(url);
    return !host || !knownHostnames.has(host);
  });
}
