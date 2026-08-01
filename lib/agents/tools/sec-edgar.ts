// SEC EDGAR full-text search tool. Gives Deal Comparables and Competitive
// Intelligence a way to cite the actual regulatory filing (an 8-K exhibit
// disclosing real deal terms, a 10-K's pipeline/risk-factor section) instead
// of secondary news coverage of it — the accuracy gap this was built to close.
//
// No API key, no registration — confirmed live before writing any of this:
//   - https://efts.sec.gov/LATEST/search-index?q=... returns real, relevant
//     hits (verified against real filings, e.g. a Windtree Therapeutics 8-K
//     matching a "license agreement" + "milestone payments" query)
//   - entityName= scopes results to one company correctly (verified against
//     Eli Lilly's real CIK 0000059478)
//   - forms=/dateRange=/startdt=/enddt= filters are accepted and change results
//   - the real filing document URL is
//     https://www.sec.gov/Archives/edgar/data/{cik-no-leading-zeros}/{accession-no-dashes}/{filename}
//     — filename comes from the part after the colon in each hit's "_id"
//     field. Verified live: constructed this way, the URL 200s and serves
//     the actual filing.
//   - SEC requires a descriptive User-Agent on every request or it 403s —
//     confirmed live (no User-Agent -> "Your Request Originates from an
//     Undeclared Automated Tool" rejection page).

import type Anthropic from "@anthropic-ai/sdk";
import { fetchWithRetry } from "./fetch-with-retry";
import { secEdgarLimiter } from "./rate-limiter";

const SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
// SEC's Fair Access policy asks every automated client to identify itself
// with a real contact — this isn't a placeholder, it's what SEC's own docs
// require (https://www.sec.gov/os/webmaster-faq#developers).
const USER_AGENT = "BioComm Copilot research@biocommcopilot.apps.human-angle.com";

export const secEdgarSearchToolDefinition: Anthropic.Tool = {
  name: "search_sec_filings",
  description:
    "Full-text search SEC EDGAR filings (10-K, 10-Q, 8-K, S-1, etc.) for a keyword and optional company name, restricted to certain form types. Returns the real filing document with a direct SEC.gov URL — use this to find primary-source evidence for deal terms, competitor financials, or pipeline disclosures instead of relying on secondary news coverage. Never invent a filing that didn't come from this tool.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Free-text keyword(s) to search for, e.g. 'license agreement milestone payments'.",
      },
      entityName: {
        type: "string",
        description: "Optional company name to restrict results to, e.g. 'Eli Lilly'.",
      },
      forms: {
        type: "string",
        description: "Optional comma-separated SEC form types to restrict to, e.g. '8-K,10-K'.",
      },
      maxResults: {
        type: "integer",
        description: "Max results to return (default 10, max 20).",
      },
    },
    required: ["query"],
  },
};

type SearchHit = {
  _id: string;
  _source: {
    ciks?: string[];
    display_names?: string[];
    form?: string;
    file_date?: string;
    file_description?: string;
  };
};

type SearchResponse = {
  hits?: {
    hits?: SearchHit[];
  };
};

export type SecFilingSearchResult = {
  formType: string;
  companyName: string;
  filingDate: string;
  description?: string;
  sourceUrl: string;
};

function buildFilingUrl(hit: SearchHit): string | null {
  const cik = hit._source.ciks?.[0];
  const [accession, filename] = hit._id.split(":");
  if (!cik || !accession || !filename) return null;
  const cikNoLeadingZeros = String(Number(cik));
  const accessionNoDashes = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accessionNoDashes}/${filename}`;
}

export async function searchSecFilings(input: {
  query: string;
  entityName?: string;
  forms?: string;
  maxResults?: number;
}): Promise<SecFilingSearchResult[]> {
  const params = new URLSearchParams({ q: input.query });
  if (input.entityName) params.set("entityName", input.entityName);
  if (input.forms) params.set("forms", input.forms);

  const res = await secEdgarLimiter(() =>
    fetchWithRetry(`${SEARCH_URL}?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    })
  );
  if (!res.ok) {
    throw new Error(`SEC EDGAR search error: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  const data = (await res.json()) as SearchResponse;
  const maxResults = Math.min(input.maxResults ?? 10, 20);

  return (data.hits?.hits ?? [])
    .slice(0, maxResults)
    .map((hit): SecFilingSearchResult | null => {
      const sourceUrl = buildFilingUrl(hit);
      if (!sourceUrl) return null;
      return {
        formType: hit._source.form ?? "",
        companyName: hit._source.display_names?.[0] ?? "",
        filingDate: hit._source.file_date ?? "",
        description: hit._source.file_description || undefined,
        sourceUrl,
      };
    })
    .filter((result): result is SecFilingSearchResult => result !== null);
}
