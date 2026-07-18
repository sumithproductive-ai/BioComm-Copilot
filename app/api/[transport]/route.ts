// MCP server for BioComm Copilot — read-only query tools over the memo
// data this app already persists to Postgres. This is a *second* consumer
// of that data (a human, through Claude Desktop/Code), not a tool layer
// for BioComm's own research agents — those call the Anthropic API
// directly and deliberately have no MCP dependency (see
// .claude/skills/build-agent/SKILL.md). Every tool here wraps a getter
// that already exists and is exercised by the memo page UI — no new
// data-access logic, just a second surface onto it.

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getClinicalLandscape,
  getCompetitiveLandscape,
  getCommercialOpportunity,
  getRegulatoryLandscape,
  getDealComparablesLandscape,
  getReviewerNotes,
  getDecisionSummary,
  getKeyRisksAndRecommendations,
  getSourceIndex,
} from "@/lib/agents/persist";

// Includes a lightweight decisionSummary preview so list/search results are
// useful for a Story-3-style "scan and decide" pass without a follow-up
// get_assessment call for every candidate — null until Synthesis has run.
const ASSESSMENT_LIST_SELECT = {
  id: true,
  target: true,
  modality: true,
  stage: true,
  indication: true,
  createdAt: true,
  hasCriticalFlags: true,
  decisionSummary: {
    select: { commercialOpportunity: true, confidenceScore: true, recommendedNextStep: true },
  },
} as const;

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_assessments",
      {
        title: "List recent BioComm assessments",
        description:
          "List the most recent UC therapy asset commercialization assessments run in BioComm Copilot, newest first.",
        inputSchema: {
          limit: z.number().int().min(1).max(50).default(10).describe("Max number of assessments to return"),
        },
      },
      async ({ limit }) => {
        const runs = await db.memoRun.findMany({
          orderBy: { createdAt: "desc" },
          take: limit,
          select: ASSESSMENT_LIST_SELECT,
        });
        return jsonContent(runs);
      }
    );

    server.registerTool(
      "search_assessments_by_target",
      {
        title: "Search BioComm assessments by target",
        description:
          "Find past BioComm Copilot assessments whose target (e.g. an asset name or mechanism like 'IL-23p19') matches a search string.",
        inputSchema: {
          query: z.string().min(1).describe("Substring to match against the assessment's target field"),
        },
      },
      async ({ query }) => {
        const runs = await db.memoRun.findMany({
          where: { target: { contains: query, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: ASSESSMENT_LIST_SELECT,
        });
        return jsonContent(runs);
      }
    );

    server.registerTool(
      "get_assessment",
      {
        title: "Get a BioComm assessment",
        description:
          "Get the full memo for one BioComm Copilot assessment by id — Decision Summary, clinical/competitive/commercial/regulatory/deal-comparables landscapes, Key Risks, Route Recommendations, Critic Agent reviewer notes, and the source index. Sections are null/empty if that agent hasn't completed or hasn't run yet (e.g. decisionSummary is null until Synthesis has run).",
        inputSchema: {
          memoRunId: z.string().uuid().describe("The assessment's id, from list_assessments or search_assessments_by_target"),
        },
      },
      async ({ memoRunId }) => {
        const memoRun = await db.memoRun.findUnique({
          where: { id: memoRunId },
          select: ASSESSMENT_LIST_SELECT,
        });
        if (!memoRun) {
          return jsonContent({ error: `No assessment found with id ${memoRunId}` });
        }

        const [
          clinical,
          competitive,
          commercial,
          regulatory,
          dealComparables,
          reviewerNotes,
          keyRisksAndRecommendations,
          sourceIndex,
        ] = await Promise.all([
          getClinicalLandscape(memoRunId),
          getCompetitiveLandscape(memoRunId),
          getCommercialOpportunity(memoRunId),
          getRegulatoryLandscape(memoRunId),
          getDealComparablesLandscape(memoRunId),
          getReviewerNotes(memoRunId),
          getKeyRisksAndRecommendations(memoRunId),
          getSourceIndex(memoRunId),
        ]);

        return jsonContent({
          ...memoRun,
          clinical,
          competitive,
          commercial,
          regulatory,
          dealComparables,
          reviewerNotes,
          keyRisks: keyRisksAndRecommendations?.keyRisks ?? [],
          routeRecommendations: keyRisksAndRecommendations?.routeRecommendations ?? [],
          sourceIndex,
        });
      }
    );

    server.registerTool(
      "get_reviewer_notes",
      {
        title: "Get Critic Agent reviewer notes",
        description:
          "Get just the Critic Agent's flags for one BioComm Copilot assessment by id — unsupported claims, missing competitors, mislabeled assumptions, stale data, contradictions, and other review flags.",
        inputSchema: {
          memoRunId: z.string().uuid().describe("The assessment's id, from list_assessments or search_assessments_by_target"),
        },
      },
      async ({ memoRunId }) => {
        const notes = await getReviewerNotes(memoRunId);
        if (!notes) {
          return jsonContent({ error: `No assessment found with id ${memoRunId}` });
        }
        return jsonContent(notes);
      }
    );

    server.registerTool(
      "get_decision_summary",
      {
        title: "Get a BioComm assessment's Decision Summary",
        description:
          "Get just the executive-scan Decision Summary for one BioComm Copilot assessment by id — Commercial Opportunity rating, Confidence Score (with its component breakdown), Key Risks/Comparable Deals counts, and Recommended Next Step. Null until the Synthesis Agent has run.",
        inputSchema: {
          memoRunId: z.string().uuid().describe("The assessment's id, from list_assessments or search_assessments_by_target"),
        },
      },
      async ({ memoRunId }) => {
        const summary = await getDecisionSummary(memoRunId);
        if (!summary) {
          return jsonContent({ error: `No assessment found with id ${memoRunId}` });
        }
        return jsonContent(summary);
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST };
