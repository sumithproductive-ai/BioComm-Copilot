// Typed schema contracts for every agent's output — AGENT_PLAN.md §6.1.
//
// These are the Zod equivalent of AGENT_PLAN.md §4's per-agent output
// schemas, field-for-field, with camelCase names matching prisma/schema.prisma
// so a validated result maps directly onto the DB models. Every agent's raw
// LLM output gets parsed against its schema here before the Orchestrator
// persists anything or hands off to the next agent — an agent that returns
// something that doesn't fit the schema is a failure to retry, not data to
// silently accept.
//
// Field-level rule: a field is required unless AGENT_PLAN.md's literal
// schema marks it optional, and a citation is embedded (not a DB citationId
// — agents don't know DB ids) wherever the matching Prisma model has a
// nullable citationId FK.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared taxonomy (AGENT_PLAN.md §6.4)
// ---------------------------------------------------------------------------

export const claimLabelSchema = z.enum(["Fact", "Assumption", "Inference", "Unknown"]);
export type ClaimLabel = z.infer<typeof claimLabelSchema>;

export const sourceTypeSchema = z.enum([
  "ClinicalTrialsGov",
  "Pubmed",
  "SecFiling",
  "PressRelease",
  "FdaLabel",
  "FdaGuidance",
  "CompanyWebsite",
  "News",
  "ConferenceAbstract",
  "MarketReport",
  "AnalystCoverage",
  "ApprovalLetter",
  "LicensingAnnouncement",
  "Other",
]);

// A citation as an agent reports it — not yet a DB row. The Orchestrator's
// persistence layer upserts a `citation` row from this and links the FK.
export const citationRefSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceUrl: z.url(),
  externalId: z.string().optional(),
  accessedDate: z.iso.date(),
  publishedDate: z.iso.date().optional(),
});
export type CitationRef = z.infer<typeof citationRefSchema>;

// ---------------------------------------------------------------------------
// Clinical Research Agent — AGENT_PLAN.md §4.2
// ---------------------------------------------------------------------------

export const trialSchema = z.object({
  nctId: z.string().regex(/^NCT\d{8}$/, "must be a real ClinicalTrials.gov NCT ID"),
  title: z.string(),
  phase: z.string(),
  status: z.enum(["Active", "Completed", "Terminated", "Recruiting"]),
  statusAsOfDate: z.iso.date(),
  sponsor: z.string(),
  enrollment: z.number().int().positive().optional(),
  primaryEndpoint: z.string().optional(),
  isStale: z.boolean().default(false),
  citation: citationRefSchema,
});

export const mechanismOfActionSchema = z.object({
  summary: z.string(),
  label: claimLabelSchema,
  citations: z.array(citationRefSchema).min(1),
});

export const safetySignalSchema = z.object({
  description: z.string(),
  label: claimLabelSchema,
  citation: citationRefSchema.optional(),
});

export const similarDrugFailureSchema = z.object({
  drug: z.string(),
  reasonForFailure: z.string(),
  label: claimLabelSchema,
  citation: citationRefSchema.optional(),
});

export const clinicalResearchOutputSchema = z.object({
  trials: z.array(trialSchema),
  mechanismOfAction: mechanismOfActionSchema,
  safetySignals: z.array(safetySignalSchema),
  similarDrugFailures: z.array(similarDrugFailureSchema),
});
export type ClinicalResearchOutput = z.infer<typeof clinicalResearchOutputSchema>;

// ---------------------------------------------------------------------------
// Competitive Intelligence Agent — AGENT_PLAN.md §4.3
// ---------------------------------------------------------------------------

export const approvedCompetitorSchema = z.object({
  drug: z.string(),
  company: z.string(),
  mechanism: z.string(),
  approvalDate: z.iso.date(),
  citation: citationRefSchema,
});

export const lateStagePipelineAssetSchema = z.object({
  drug: z.string(),
  company: z.string(),
  mechanism: z.string(),
  phase: z.string(),
  status: z.string(),
  citation: citationRefSchema,
});

export const positioningGapSchema = z.object({
  description: z.string(),
  label: claimLabelSchema,
});

export const competitiveIntelligenceOutputSchema = z.object({
  approvedCompetitors: z.array(approvedCompetitorSchema),
  lateStagePipeline: z.array(lateStagePipelineAssetSchema),
  positioningGaps: z.array(positioningGapSchema),
});
export type CompetitiveIntelligenceOutput = z.infer<typeof competitiveIntelligenceOutputSchema>;

// ---------------------------------------------------------------------------
// Commercial Opportunity Agent — AGENT_PLAN.md §4.4
// ---------------------------------------------------------------------------

export const commercialOpportunityOutputSchema = z.object({
  patientPopulationEstimate: z.object({
    value: z.string(),
    label: claimLabelSchema, // "never Fact unless directly sourced" — enforced in the agent prompt, not the type
    citation: citationRefSchema.optional(),
  }),
  unmetNeed: z.object({
    summary: z.string(),
    citations: z.array(citationRefSchema),
  }),
  marketCrowdingAssessment: z.object({
    summary: z.string(),
    consistentWithCompetitiveLandscape: z.boolean(),
  }),
  differentiationPotential: z.object({
    summary: z.string(),
    label: claimLabelSchema, // defaults to "Inference" unless directly sourced
  }),
});
export type CommercialOpportunityOutput = z.infer<typeof commercialOpportunityOutputSchema>;

// ---------------------------------------------------------------------------
// Deal Comparables Agent — AGENT_PLAN.md §4.5
// ---------------------------------------------------------------------------

export const comparableDealSchema = z.object({
  asset: z.string(),
  company: z.string(),
  stageAtDeal: z.string(),
  dealType: z.enum(["License", "Acquisition"]),
  disclosedTerms: z.string(), // "not disclosed" is a valid value, never an estimated figure
  compStrength: z.enum(["Direct", "Approximate"]),
  citation: citationRefSchema,
});

export const dealComparablesOutputSchema = z
  .object({
    comparableDeals: z.array(comparableDealSchema),
    noCompFound: z.boolean(),
    noCompExplanation: z.string().optional(),
  })
  .refine(
    (data) => !data.noCompFound || (data.noCompExplanation && data.noCompExplanation.length > 0),
    { message: "noCompExplanation is required when noCompFound is true", path: ["noCompExplanation"] }
  )
  .refine((data) => !data.noCompFound || data.comparableDeals.length === 0, {
    message: "comparableDeals must be empty when noCompFound is true — the agent must not fabricate a deal",
    path: ["comparableDeals"],
  });
export type DealComparablesOutput = z.infer<typeof dealComparablesOutputSchema>;

// ---------------------------------------------------------------------------
// Regulatory Agent — AGENT_PLAN.md §4.6
// ---------------------------------------------------------------------------

export const guidanceDocumentSchema = z.object({
  title: z.string(),
  url: z.url(),
  relevance: z.string(),
});

export const priorApprovalSchema = z.object({
  drug: z.string(),
  approvalDate: z.iso.date(),
  citation: citationRefSchema,
});

export const endpointPrecedentSchema = z.object({
  endpoint: z.string(),
  sourcedFromLabels: z.array(z.string()).min(2, "must cite at least 2 approved UC labels (Story 7)"),
  citations: z.array(citationRefSchema).min(1),
});

export const regulatoryOutputSchema = z.object({
  guidanceDocuments: z.array(guidanceDocumentSchema),
  endpointPrecedent: z.array(endpointPrecedentSchema),
  priorApprovalsSameMechanism: z.array(priorApprovalSchema),
  developmentTimelineEstimate: z.object({
    summary: z.string(),
    label: z.literal("Assumption"), // always Assumption, never Fact — AGENT_PLAN.md §4.6 guardrail
  }),
});
export type RegulatoryOutput = z.infer<typeof regulatoryOutputSchema>;

// ---------------------------------------------------------------------------
// Critic Agent — AGENT_PLAN.md §4.7
// ---------------------------------------------------------------------------

export const criticFlagTypeSchema = z.enum([
  "UnsupportedClaim",
  "MissingCompetitor",
  "AssumptionAsFact",
  "UndisclosedTerms",
  "StaleData",
  "OverconfidentRegulatory",
  "Contradiction",
]);

export const criticFlagSchema = z.object({
  type: criticFlagTypeSchema,
  section: z.string(),
  description: z.string(),
});

export const criticOutputSchema = z.object({
  flags: z.array(criticFlagSchema),
  hasCriticalFlags: z.boolean(),
});
export type CriticOutput = z.infer<typeof criticOutputSchema>;

// ---------------------------------------------------------------------------
// Synthesis Agent — AGENT_PLAN.md §4.8 + §5.1 confidence formula
// Key Risks / Route Recommendations fill the gap ERD.md's review found:
// PRD.md requires both memo sections but no agent schema ever defined them.
// ---------------------------------------------------------------------------

export const keyRiskSchema = z.object({
  description: z.string(),
  label: claimLabelSchema,
  citation: citationRefSchema.optional(),
});

export const routeRecommendationSchema = z.object({
  description: z.string(),
  label: z.literal("Assumption"), // PRD.md: "All recommendations labeled as assumptions"
});

export const decisionSummarySchema = z.object({
  commercialOpportunity: z.enum(["High", "Medium", "Low"]),
  // Component scores AGENT_PLAN.md §5.1's formula weights (0-1 each) —
  // computed in code from agent outputs, never guessed by an LLM.
  clinicalDataCompleteness: z.number().min(0).max(1),
  competitiveCoverageCompleteness: z.number().min(0).max(1),
  commercialSourceQuality: z.number().min(0).max(1),
  regulatoryPrecedentStrength: z.number().min(0).max(1),
  inverseCriticFlagSeverity: z.number().min(0).max(1),
  confidenceScore: z.number().min(0).max(10),
  keyRisksCount: z.number().int().min(0),
  comparableDealsFoundCount: z.number().int().min(0),
  recommendedNextStep: z.enum(["ContinueDiligence", "GatherMoreData", "DoNotPursue"]),
});
export type DecisionSummary = z.infer<typeof decisionSummarySchema>;

export const synthesisOutputSchema = z.object({
  decisionSummary: decisionSummarySchema,
  keyRisks: z.array(keyRiskSchema),
  routeRecommendations: z.array(routeRecommendationSchema),
  asOfDate: z.iso.date(),
});
export type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;

// ---------------------------------------------------------------------------
// Orchestrator manifest — AGENT_PLAN.md §4.1 output
// ---------------------------------------------------------------------------

export const agentNameSchema = z.enum([
  "clinical",
  "competitive",
  "commercial",
  "dealComparables",
  "regulatory",
  "critic",
  "synthesis",
]);

export const agentStatusSchema = z.enum(["complete", "incomplete", "failed"]);

export const researchOutputsSchema = z.object({
  clinical: clinicalResearchOutputSchema.nullable(),
  competitive: competitiveIntelligenceOutputSchema.nullable(),
  commercial: commercialOpportunityOutputSchema.nullable(),
  dealComparables: dealComparablesOutputSchema.nullable(),
  regulatory: regulatoryOutputSchema.nullable(),
});
export type ResearchOutputs = z.infer<typeof researchOutputsSchema>;
