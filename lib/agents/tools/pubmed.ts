// PubMed (NCBI E-utilities) tool. Same fallback pattern as ClinicalTrials.gov
// — no dedicated MCP server assumed, thin fetch wrapper over the public API
// (esearch for PMIDs, esummary for details). No API key required for
// low-volume use.

import type Anthropic from "@anthropic-ai/sdk";
import { fetchWithRetry } from "./fetch-with-retry";
import { pubmedLimiter } from "./rate-limiter";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

export const pubmedToolDefinition: Anthropic.Tool = {
  name: "search_pubmed",
  description:
    "Search PubMed for peer-reviewed literature matching a free-text query. Returns PMIDs, titles, journal, publication date, and authors — use this for mechanism-of-action and efficacy literature, never state a claim as sourced from PubMed without a real PMID from this tool.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text PubMed search query." },
      maxResults: { type: "integer", description: "Max results (default 5, max 10)." },
    },
    required: ["query"],
  },
};

type EsearchResponse = { esearchresult?: { idlist?: string[] } };
type EsummaryResult = {
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  authors?: { name?: string }[];
};
type EsummaryResponse = { result?: Record<string, EsummaryResult | string[]> };

export type PubmedSearchResult = {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  authors: string[];
  sourceUrl: string;
};

export async function searchPubmed(input: {
  query: string;
  maxResults?: number;
}): Promise<PubmedSearchResult[]> {
  const retmax = Math.min(input.maxResults ?? 5, 10);
  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: input.query,
    retmax: String(retmax),
    retmode: "json",
  });
  const searchRes = await pubmedLimiter(() =>
    fetchWithRetry(`${ESEARCH}?${searchParams.toString()}`)
  );
  if (!searchRes.ok) {
    throw new Error(`PubMed esearch error: ${searchRes.status} ${searchRes.statusText}`);
  }
  const searchData = (await searchRes.json()) as EsearchResponse;
  const ids = searchData.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
  });
  const summaryRes = await pubmedLimiter(() =>
    fetchWithRetry(`${ESUMMARY}?${summaryParams.toString()}`)
  );
  if (!summaryRes.ok) {
    throw new Error(`PubMed esummary error: ${summaryRes.status} ${summaryRes.statusText}`);
  }
  const summaryData = (await summaryRes.json()) as EsummaryResponse;

  return ids
    .map((pmid): PubmedSearchResult | null => {
      const entry = summaryData.result?.[pmid];
      if (!entry || Array.isArray(entry)) return null;
      return {
        pmid,
        title: entry.title ?? "",
        journal: entry.fulljournalname ?? entry.source ?? "",
        pubDate: entry.pubdate ?? "",
        authors: (entry.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
        sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    })
    .filter((r): r is PubmedSearchResult => r !== null);
}
