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
// Live-verified against real credentials (2026-08-01) — and this caught a
// real bug the "best-first-pass" parser had wrong, not just confirmed it:
//   - The plain /published-data/search endpoint (what this file originally
//     used) returns only a bare list of publication references (just
//     document IDs) — no title, no applicant, no dates. A real query for
//     "pa=AbbVie" returned @total-result-count: 1629 (proving the query
//     and auth were both fine) but parsed to zero usable results, because
//     the response genuinely doesn't carry bibliographic data at that path.
//   - The fix: /published-data/search/biblio (the "biblio" constituent)
//     returns full exchange-document records instead. Confirmed live: a
//     "ta=risankizumab" query against this path returned real
//     invention-title/parties/applicant-name data.
//   - The results also nest one level deeper than assumed:
//     ops:search-result.exchange-documents (plural, an array) of
//     { "exchange-document": {...} } wrapper objects — not
//     ops:search-result.exchange-document directly.
//   - Each applicant appears twice per data-format ("epodoc", all-caps
//     with a bracketed country suffix like "ABBVIE INC [US]", vs.
//     "original", human-readable like "AbbVie Inc.") — prefer "original"
//     when present for a cleaner display name.
// Separately confirmed: a zero-match query returns HTTP 404 with an XML
// SERVER.EntityNotFound fault body, not a 200 with an empty result set —
// an unusual REST convention, but confirmed, not guessed. searchPatents
// treats that specific case as "no results" (returns []), not an error.

import type Anthropic from "@anthropic-ai/sdk";
import { fetchWithRetry } from "./fetch-with-retry";
import { epoPatentsLimiter } from "./rate-limiter";

const AUTH_URL = "https://ops.epo.org/3.2/auth/accesstoken";
const SEARCH_URL = "https://ops.epo.org/3.2/rest-services/published-data/search/biblio";

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

// Parser for the real /biblio response shape, confirmed live (see file
// header) — not the originally-guessed shape. Defensive throughout
// (optional chaining, no assumed-present fields) so a structural surprise
// fails soft (empty results) rather than throwing and taking down the
// whole agent call.
function parseSearchResponse(data: unknown): PatentSearchResult[] {
  type ApplicantEntry = {
    "@data-format"?: string;
    "applicant-name"?: { name?: { $?: string } };
  };

  type ExchangeDocument = {
    "@doc-number"?: string;
    "@country"?: string;
    "@kind"?: string;
    "bibliographic-data"?: {
      "invention-title"?: { $?: string } | { $?: string }[];
      parties?: {
        applicants?: { applicant?: ApplicantEntry | ApplicantEntry[] };
      };
      "publication-reference"?: {
        "document-id"?: { date?: { $?: string } } | Array<{ date?: { $?: string } }>;
      };
    };
  };

  // Each real result is { "exchange-document": ExchangeDocument }, not the
  // ExchangeDocument directly — confirmed live, see file header.
  type ExchangeDocumentWrapper = { "exchange-document"?: ExchangeDocument };

  type SearchResponse = {
    "ops:world-patent-data"?: {
      "ops:biblio-search"?: {
        "ops:search-result"?: {
          // Plural key, confirmed live — not "exchange-document" (singular).
          "exchange-documents"?: ExchangeDocumentWrapper | ExchangeDocumentWrapper[];
        };
      };
    };
  };

  const rawWrappers = (data as SearchResponse)["ops:world-patent-data"]?.["ops:biblio-search"]?.[
    "ops:search-result"
  ]?.["exchange-documents"];
  const wrappers: ExchangeDocumentWrapper[] =
    rawWrappers === undefined ? [] : Array.isArray(rawWrappers) ? rawWrappers : [rawWrappers];
  const documents = wrappers.map((w) => w["exchange-document"]).filter((d): d is ExchangeDocument => !!d);

  return documents.map((doc): PatentSearchResult => {
    const docNumber = doc["@doc-number"] ?? "";
    const country = doc["@country"] ?? "";
    const kind = doc["@kind"] ?? "";
    const patentNumber = `${country}${docNumber}${kind}`;

    const titleField = doc["bibliographic-data"]?.["invention-title"];
    const title = Array.isArray(titleField) ? (titleField[0]?.$ ?? "") : (titleField?.$ ?? "");

    // OPS lists each applicant twice, once per data-format: "epodoc"
    // (all-caps, bracketed country code, e.g. "ABBVIE INC [US]") and
    // "original" (human-readable, e.g. "AbbVie Inc."). Prefer "original"
    // when present, confirmed live against a real multi-entry response.
    const applicantData = doc["bibliographic-data"]?.parties?.applicants?.applicant;
    const applicantList = Array.isArray(applicantData)
      ? applicantData
      : applicantData
        ? [applicantData]
        : [];
    const preferredApplicant =
      applicantList.find((a) => a["@data-format"] === "original") ?? applicantList[0];
    const applicant = preferredApplicant?.["applicant-name"]?.name?.$ ?? "";

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
    // OPS's real, confirmed behavior for a zero-match query: HTTP 404 with
    // an XML SERVER.EntityNotFound fault body — not a 200 with an empty
    // result set. Treat that specific case as "no results," not a real
    // error; anything else (auth failure, malformed query, rate limit,
    // server error) still throws.
    const body = await res.text();
    if (res.status === 404 && body.includes("SERVER.EntityNotFound")) {
      return [];
    }
    throw new Error(`EPO OPS search error: ${res.status} ${res.statusText} — ${body}`);
  }
  const data = await res.json();
  return parseSearchResponse(data);
}
