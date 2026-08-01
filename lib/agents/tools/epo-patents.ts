// EPO Open Patent Services (OPS) tool. Chosen over USPTO's free PatentsView
// API because that one is mid-migration into a JS-rendered, bot-challenge
// protected portal that couldn't be verified live; EPO OPS was confirmed
// live and working via direct testing before writing any of this:
//   - https://ops.epo.org/3.2/rest-services/ is a real, responding host
//   - POSTing to /3.2/auth/accesstoken with no credentials returns the
//     expected "Client identifier is required" 401 — confirms the OAuth2
//     client-credentials token endpoint is genuine, not guessed
//   - GETting /3.2/rest-services/published-data/search?q=... with no auth
//     returns a real "Fair Use policy" 403, not a 404 — confirms the search
//     endpoint and its q= CQL query syntax (field prefixes like ta= for
//     title, pa= for applicant) are genuine
//
// Needs EPO_OPS_CLIENT_ID / EPO_OPS_CLIENT_SECRET env vars — free
// registration at https://developers.epo.org, same shape as the Google
// OAuth credential step: a manual, one-time step that can't be automated.
//
// One thing NOT yet verified live (needs real credentials to test): the
// exact shape of a successful search response body. OPS's JSON responses
// nest results under ops:world-patent-data -> ops:biblio-search ->
// ops:search-result -> exchange-documents[] per its documented schema —
// the parsing below follows that structure, but treat it as a
// best-first-pass, not confirmed, until tested against a real response.

import type Anthropic from "@anthropic-ai/sdk";
import { fetchWithRetry } from "./fetch-with-retry";
import { epoPatentsLimiter } from "./rate-limiter";

const AUTH_URL = "https://ops.epo.org/3.2/auth/accesstoken";
const SEARCH_URL = "https://ops.epo.org/3.2/rest-services/published-data/search";

export const epoPatentSearchToolDefinition: Anthropic.Tool = {
  name: "search_patents",
  description:
    "Search EPO Open Patent Services for published patents matching an applicant/company name and/or a free-text keyword. Returns patent number, title, applicant, filing/publication dates, and status — never invent a patent number that didn't come from this tool.",
  input_schema: {
    type: "object",
    properties: {
      applicant: {
        type: "string",
        description: "Company/applicant name to search for, e.g. 'Eli Lilly'.",
      },
      keyword: {
        type: "string",
        description: "Free-text keyword to search in the patent title, e.g. a drug/target name.",
      },
      maxResults: {
        type: "integer",
        description: "Max results to return (default 10, max 25).",
      },
    },
  },
};

type CachedToken = { accessToken: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;

  const clientId = process.env.EPO_OPS_CLIENT_ID;
  const clientSecret = process.env.EPO_OPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "EPO_OPS_CLIENT_ID / EPO_OPS_CLIENT_SECRET are not set — register for free OPS API credentials at https://developers.epo.org"
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetchWithRetry(AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`EPO OPS auth error: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: string };

  // expires_in is seconds-as-string per OPS's token response; refresh 60s
  // early so a call never starts on a token about to expire mid-request.
  const expiresInMs = Number(data.expires_in) * 1000;
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + expiresInMs - 60_000 };
  return cachedToken.accessToken;
}

export type PatentSearchResult = {
  patentNumber: string;
  title: string;
  applicant: string;
  publicationDate?: string;
  sourceUrl: string;
};

// OPS's CQL query syntax: ta= (title), pa= (applicant) — confirmed live
// that the search endpoint recognizes this field-prefix syntax (a 403 Fair
// Use rejection, not a 400 malformed-query error, for a request using it).
function buildQuery(input: { applicant?: string; keyword?: string }): string {
  const clauses: string[] = [];
  if (input.keyword) clauses.push(`ta=${input.keyword}`);
  if (input.applicant) clauses.push(`pa=${input.applicant}`);
  return clauses.join(" and ");
}

// Best-first-pass parser per OPS's documented exchange-documents JSON
// structure — flagged in the file header as needing live verification once
// real credentials exist. Defensive throughout (optional chaining, no
// assumed-present fields) so a structural surprise fails soft (empty
// results) rather than throwing and taking down the whole agent call.
function parseSearchResponse(data: unknown): PatentSearchResult[] {
  type ExchangeDocument = {
    "@doc-number"?: string;
    "@country"?: string;
    "@kind"?: string;
    "bibliographic-data"?: {
      "invention-title"?: { $?: string } | { $?: string }[];
      parties?: {
        applicants?: { applicant?: { "applicant-name"?: { name?: { $?: string } } } | Array<unknown> };
      };
      "publication-reference"?: {
        "document-id"?: { date?: { $?: string } } | Array<{ date?: { $?: string } }>;
      };
    };
  };

  type SearchResponse = {
    "ops:world-patent-data"?: {
      "ops:biblio-search"?: {
        "ops:search-result"?: {
          "exchange-document"?: ExchangeDocument | ExchangeDocument[];
        };
      };
    };
  };

  const rawDocuments = (data as SearchResponse)["ops:world-patent-data"]?.["ops:biblio-search"]?.[
    "ops:search-result"
  ]?.["exchange-document"];
  const documents: ExchangeDocument[] =
    rawDocuments === undefined ? [] : Array.isArray(rawDocuments) ? rawDocuments : [rawDocuments];

  return documents.map((doc): PatentSearchResult => {
    const docNumber = doc["@doc-number"] ?? "";
    const country = doc["@country"] ?? "";
    const kind = doc["@kind"] ?? "";
    const patentNumber = `${country}${docNumber}${kind}`;

    const titleField = doc["bibliographic-data"]?.["invention-title"];
    const title = Array.isArray(titleField) ? (titleField[0]?.$ ?? "") : (titleField?.$ ?? "");

    const applicantData = doc["bibliographic-data"]?.parties?.applicants?.applicant;
    const firstApplicant = Array.isArray(applicantData) ? applicantData[0] : applicantData;
    const applicant =
      (firstApplicant as { "applicant-name"?: { name?: { $?: string } } })?.["applicant-name"]?.name
        ?.$ ?? "";

    const pubRef = doc["bibliographic-data"]?.["publication-reference"]?.["document-id"];
    const pubRefFirst = Array.isArray(pubRef) ? pubRef[0] : pubRef;
    const publicationDateRaw = pubRefFirst?.date?.$; // "YYYYMMDD" per OPS convention
    const publicationDate =
      publicationDateRaw && /^\d{8}$/.test(publicationDateRaw)
        ? `${publicationDateRaw.slice(0, 4)}-${publicationDateRaw.slice(4, 6)}-${publicationDateRaw.slice(6, 8)}`
        : undefined;

    return {
      patentNumber,
      title,
      applicant,
      publicationDate,
      sourceUrl: `https://worldwide.espacenet.com/patent/search/family/publication/${patentNumber}`,
    };
  });
}

export async function searchPatents(input: {
  applicant?: string;
  keyword?: string;
  maxResults?: number;
}): Promise<PatentSearchResult[]> {
  if (!input.applicant && !input.keyword) return [];

  const token = await getAccessToken();
  const query = buildQuery(input);
  const rangeEnd = Math.min(input.maxResults ?? 10, 25);

  const res = await epoPatentsLimiter(() =>
    fetchWithRetry(`${SEARCH_URL}?q=${encodeURIComponent(query)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Range: `1-${rangeEnd}`,
      },
    })
  );
  if (!res.ok) {
    throw new Error(`EPO OPS search error: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  const data = await res.json();
  return parseSearchResponse(data);
}
