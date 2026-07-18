// ClinicalTrials.gov API v2 tool. No dedicated MCP server assumed to exist
// for this — it's a thin fetch wrapper over the public REST API (no auth
// required), same fallback pattern as the SEC EDGAR tool. Field paths below
// were confirmed against a real API response, not guessed:
// protocolSection.{identificationModule,statusModule,sponsorCollaboratorsModule,
// designModule,outcomesModule}.

import type Anthropic from "@anthropic-ai/sdk";
import { fetchWithRetry } from "./fetch-with-retry";

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";

export const clinicalTrialsToolDefinition: Anthropic.Tool = {
  name: "search_clinical_trials",
  description:
    "Search ClinicalTrials.gov for trials matching a free-text query and an optional condition filter. Returns NCT IDs, titles, phase, status, sponsor, enrollment, and primary endpoint — never invent an NCT ID that didn't come from this tool.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Free-text search term, e.g. a drug/target name.",
      },
      condition: {
        type: "string",
        description: "Optional condition filter, e.g. 'ulcerative colitis'.",
      },
      pageSize: {
        type: "integer",
        description: "Max results to return (default 10, max 20).",
      },
    },
    required: ["query"],
  },
};

function normalizeToFullDate(date: string | undefined): string {
  if (!date) return "";
  // "2026-01" (year-month only) -> "2026-01-01"; already-full dates pass through.
  return /^\d{4}-\d{2}$/.test(date) ? `${date}-01` : date;
}

type RawStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string; statusVerifiedDate?: string };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    designModule?: { phases?: string[]; enrollmentInfo?: { count?: number } };
    outcomesModule?: { primaryOutcomes?: { measure?: string }[] };
  };
};

export type ClinicalTrialsSearchResult = {
  nctId: string;
  title: string;
  phase: string;
  status: string;
  statusAsOfDate: string;
  sponsor: string;
  enrollment?: number;
  primaryEndpoint?: string;
  sourceUrl: string;
};

export async function searchClinicalTrials(input: {
  query: string;
  condition?: string;
  pageSize?: number;
}): Promise<ClinicalTrialsSearchResult[]> {
  const params = new URLSearchParams({
    "query.term": input.query,
    pageSize: String(Math.min(input.pageSize ?? 10, 20)),
  });
  if (input.condition) params.set("query.cond", input.condition);

  const res = await fetchWithRetry(`${API_BASE}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov API error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { studies?: RawStudy[] };

  return (data.studies ?? []).map((study): ClinicalTrialsSearchResult => {
    const p = study.protocolSection ?? {};
    const nctId = p.identificationModule?.nctId ?? "";
    return {
      nctId,
      title: p.identificationModule?.briefTitle ?? "",
      phase: p.designModule?.phases?.join(", ") || "Not specified",
      status: p.statusModule?.overallStatus ?? "Unknown",
      // ClinicalTrials.gov only reports statusVerifiedDate at month
      // granularity ("2026-01"); normalize to a full date so it matches
      // the schema's date format without losing what the field means.
      statusAsOfDate: normalizeToFullDate(p.statusModule?.statusVerifiedDate),
      sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? "",
      enrollment: p.designModule?.enrollmentInfo?.count,
      primaryEndpoint: p.outcomesModule?.primaryOutcomes?.[0]?.measure,
      sourceUrl: `https://clinicaltrials.gov/study/${nctId}`,
    };
  });
}
