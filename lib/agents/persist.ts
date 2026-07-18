// Maps validated agent output onto schema.prisma tables — the "separate
// persistence step" the build-agent skill requires instead of letting
// agents touch Prisma directly. One function per agent's output shape.

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import type {
  ClinicalResearchOutput,
  CompetitiveIntelligenceOutput,
  CommercialOpportunityOutput,
  RegulatoryOutput,
  DealComparablesOutput,
  CriticOutput,
  SynthesisOutput,
  CitationRef,
} from "./schemas";
import type { AgentLiveStatus } from "./roster";

// Story 9 AC: "If no flags were raised, the section states 'No critical
// flags identified — standard human review still required'". This is
// static UI copy driven by data (like ERD.md's reviewer_notes_summary
// field), not something the Critic Agent itself generates — flags render
// verbatim when present, so this line only ever covers the empty case.
const NO_FLAGS_REVIEWER_NOTE = "No critical flags identified — standard human review still required.";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

async function createCitation(tx: Tx, memoRunId: string, citation: CitationRef) {
  return tx.citation.create({
    data: {
      memoRunId,
      sourceType: citation.sourceType,
      sourceUrl: citation.sourceUrl,
      externalId: citation.externalId,
      accessedDate: new Date(citation.accessedDate),
      publishedDate: citation.publishedDate ? new Date(citation.publishedDate) : undefined,
    },
  });
}

export async function persistClinicalResearchOutput(
  memoRunId: string,
  output: ClinicalResearchOutput
): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const trial of output.trials) {
      const citation = await createCitation(tx, memoRunId, trial.citation);
      await tx.trial.create({
        data: {
          memoRunId,
          citationId: citation.id,
          nctId: trial.nctId,
          title: trial.title,
          phase: trial.phase,
          status: trial.status,
          statusAsOfDate: new Date(trial.statusAsOfDate),
          sponsor: trial.sponsor,
          enrollment: trial.enrollment,
          primaryEndpoint: trial.primaryEndpoint,
          isStale: trial.isStale,
        },
      });
    }

    await tx.memoRun.update({
      where: { id: memoRunId },
      data: {
        mechanismSummary: output.mechanismOfAction.summary,
        mechanismLabel: output.mechanismOfAction.label,
      },
    });
    for (const citationRef of output.mechanismOfAction.citations) {
      const citation = await createCitation(tx, memoRunId, citationRef);
      await tx.mechanismCitation.create({
        data: { memoRunId, citationId: citation.id },
      });
    }

    for (const signal of output.safetySignals) {
      const citation = signal.citation
        ? await createCitation(tx, memoRunId, signal.citation)
        : null;
      await tx.safetySignal.create({
        data: {
          memoRunId,
          citationId: citation?.id,
          description: signal.description,
          label: signal.label,
        },
      });
    }

    for (const failure of output.similarDrugFailures) {
      const citation = failure.citation
        ? await createCitation(tx, memoRunId, failure.citation)
        : null;
      await tx.similarDrugFailure.create({
        data: {
          memoRunId,
          citationId: citation?.id,
          drug: failure.drug,
          reasonForFailure: failure.reasonForFailure,
          label: failure.label,
        },
      });
    }
  });
}

export async function persistCompetitiveIntelligenceOutput(
  memoRunId: string,
  output: CompetitiveIntelligenceOutput
): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const competitor of output.approvedCompetitors) {
      const citation = await createCitation(tx, memoRunId, competitor.citation);
      await tx.approvedCompetitor.create({
        data: {
          memoRunId,
          citationId: citation.id,
          drug: competitor.drug,
          company: competitor.company,
          mechanism: competitor.mechanism,
          approvalDate: new Date(competitor.approvalDate),
        },
      });
    }

    for (const asset of output.lateStagePipeline) {
      const citation = await createCitation(tx, memoRunId, asset.citation);
      await tx.lateStagePipelineAsset.create({
        data: {
          memoRunId,
          citationId: citation.id,
          drug: asset.drug,
          company: asset.company,
          mechanism: asset.mechanism,
          phase: asset.phase,
          status: asset.status,
        },
      });
    }

    for (const gap of output.positioningGaps) {
      await tx.positioningGap.create({
        data: {
          memoRunId,
          description: gap.description,
          label: gap.label,
        },
      });
    }
  });
}

export async function persistCommercialOpportunityOutput(
  memoRunId: string,
  output: CommercialOpportunityOutput
): Promise<void> {
  await db.$transaction(async (tx) => {
    const patientPopulationCitation = output.patientPopulationEstimate.citation
      ? await createCitation(tx, memoRunId, output.patientPopulationEstimate.citation)
      : null;

    await tx.memoRun.update({
      where: { id: memoRunId },
      data: {
        patientPopulationValue: output.patientPopulationEstimate.value,
        patientPopulationLabel: output.patientPopulationEstimate.label,
        patientPopulationCitationId: patientPopulationCitation?.id,
        unmetNeedSummary: output.unmetNeed.summary,
        marketCrowdingSummary: output.marketCrowdingAssessment.summary,
        marketCrowdingConsistent: output.marketCrowdingAssessment.consistentWithCompetitiveLandscape,
        differentiationSummary: output.differentiationPotential.summary,
        differentiationLabel: output.differentiationPotential.label,
      },
    });

    for (const citationRef of output.unmetNeed.citations) {
      const citation = await createCitation(tx, memoRunId, citationRef);
      await tx.unmetNeedCitation.create({
        data: { memoRunId, citationId: citation.id },
      });
    }
  });
}

export type CommercialOpportunity = Prisma.MemoRunGetPayload<{
  select: {
    patientPopulationValue: true;
    patientPopulationLabel: true;
    patientPopulationCitation: true;
    unmetNeedSummary: true;
    unmetNeedCitations: { include: { citation: true } };
    marketCrowdingSummary: true;
    marketCrowdingConsistent: true;
    differentiationSummary: true;
    differentiationLabel: true;
  };
}>;

export async function getCommercialOpportunity(memoRunId: string): Promise<CommercialOpportunity | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      patientPopulationValue: true,
      patientPopulationLabel: true,
      patientPopulationCitation: true,
      unmetNeedSummary: true,
      unmetNeedCitations: { include: { citation: true } },
      marketCrowdingSummary: true,
      marketCrowdingConsistent: true,
      differentiationSummary: true,
      differentiationLabel: true,
    },
  });
}

export async function persistRegulatoryOutput(
  memoRunId: string,
  output: RegulatoryOutput
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.memoRun.update({
      where: { id: memoRunId },
      data: {
        developmentTimelineSummary: output.developmentTimelineEstimate.summary,
        developmentTimelineLabel: output.developmentTimelineEstimate.label,
      },
    });

    for (const doc of output.guidanceDocuments) {
      await tx.guidanceDocument.create({
        data: { memoRunId, title: doc.title, url: doc.url, relevance: doc.relevance },
      });
    }

    for (const approval of output.priorApprovalsSameMechanism) {
      const citation = await createCitation(tx, memoRunId, approval.citation);
      await tx.priorApproval.create({
        data: {
          memoRunId,
          citationId: citation.id,
          drug: approval.drug,
          approvalDate: new Date(approval.approvalDate),
        },
      });
    }

    for (const precedent of output.endpointPrecedent) {
      const created = await tx.endpointPrecedent.create({
        data: {
          memoRunId,
          endpoint: precedent.endpoint,
          sourcedFromLabels: precedent.sourcedFromLabels,
        },
      });
      for (const citationRef of precedent.citations) {
        const citation = await createCitation(tx, memoRunId, citationRef);
        await tx.endpointPrecedentCitation.create({
          data: { endpointPrecedentId: created.id, citationId: citation.id },
        });
      }
    }
  });
}

export type RegulatoryLandscape = Prisma.MemoRunGetPayload<{
  select: {
    developmentTimelineSummary: true;
    developmentTimelineLabel: true;
    guidanceDocuments: true;
    priorApprovals: { include: { citation: true } };
    endpointPrecedents: { include: { citations: { include: { citation: true } } } };
  };
}>;

export async function getRegulatoryLandscape(memoRunId: string): Promise<RegulatoryLandscape | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      developmentTimelineSummary: true,
      developmentTimelineLabel: true,
      guidanceDocuments: true,
      priorApprovals: { include: { citation: true } },
      endpointPrecedents: { include: { citations: { include: { citation: true } } } },
    },
  });
}

export async function persistDealComparablesOutput(
  memoRunId: string,
  output: DealComparablesOutput
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.memoRun.update({
      where: { id: memoRunId },
      data: {
        noCompFound: output.noCompFound,
        noCompExplanation: output.noCompExplanation,
      },
    });

    for (const deal of output.comparableDeals) {
      const citation = await createCitation(tx, memoRunId, deal.citation);
      await tx.comparableDeal.create({
        data: {
          memoRunId,
          citationId: citation.id,
          asset: deal.asset,
          company: deal.company,
          stageAtDeal: deal.stageAtDeal,
          dealType: deal.dealType,
          disclosedTerms: deal.disclosedTerms,
          compStrength: deal.compStrength,
        },
      });
    }
  });
}

export type DealComparablesLandscape = Prisma.MemoRunGetPayload<{
  select: {
    noCompFound: true;
    noCompExplanation: true;
    comparableDeals: { include: { citation: true } };
  };
}>;

export async function getDealComparablesLandscape(
  memoRunId: string
): Promise<DealComparablesLandscape | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      noCompFound: true,
      noCompExplanation: true,
      comparableDeals: { include: { citation: true } },
    },
  });
}

export async function persistCriticOutput(memoRunId: string, output: CriticOutput): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.memoRun.update({
      where: { id: memoRunId },
      data: {
        hasCriticalFlags: output.hasCriticalFlags,
        reviewerNotesSummary: output.flags.length === 0 ? NO_FLAGS_REVIEWER_NOTE : null,
      },
    });

    for (const flag of output.flags) {
      await tx.criticFlag.create({
        data: {
          memoRunId,
          type: flag.type,
          section: flag.section,
          description: flag.description,
        },
      });
    }
  });
}

export type ReviewerNotes = Prisma.MemoRunGetPayload<{
  select: {
    hasCriticalFlags: true;
    reviewerNotesSummary: true;
    criticFlags: true;
  };
}>;

export async function getReviewerNotes(memoRunId: string): Promise<ReviewerNotes | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      hasCriticalFlags: true,
      reviewerNotesSummary: true,
      criticFlags: true,
    },
  });
}

export type CompetitiveLandscape = Prisma.MemoRunGetPayload<{
  select: {
    approvedCompetitors: { include: { citation: true } };
    lateStagePipelineAssets: { include: { citation: true } };
    positioningGaps: true;
  };
}>;

export async function getCompetitiveLandscape(
  memoRunId: string
): Promise<CompetitiveLandscape | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      approvedCompetitors: { include: { citation: true } },
      lateStagePipelineAssets: { include: { citation: true } },
      positioningGaps: true,
    },
  });
}

export type ClinicalLandscape = Prisma.MemoRunGetPayload<{
  select: {
    mechanismSummary: true;
    mechanismLabel: true;
    trials: { include: { citation: true } };
    safetySignals: { include: { citation: true } };
    similarDrugFailures: { include: { citation: true } };
  };
}>;

export async function getClinicalLandscape(memoRunId: string): Promise<ClinicalLandscape | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      mechanismSummary: true,
      mechanismLabel: true,
      trials: { include: { citation: true } },
      safetySignals: { include: { citation: true } },
      similarDrugFailures: { include: { citation: true } },
    },
  });
}

// Synthesis Agent (AGENT_PLAN.md §4.8) — last agent to run, stamps
// asOfDate/elapsedMs/generatedAt onto MemoRun (ERD.md: "Set by the
// Synthesis Agent once a run completes") and writes the Decision Summary,
// Key Risks, and Route Recommendations that only exist once a run is done.
export async function persistSynthesisOutput(
  memoRunId: string,
  output: SynthesisOutput,
  elapsedMs: number
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.memoRun.update({
      where: { id: memoRunId },
      data: {
        asOfDate: new Date(output.asOfDate),
        elapsedMs,
        generatedAt: new Date(),
      },
    });

    const { decisionSummary } = output;
    await tx.decisionSummary.upsert({
      where: { memoRunId },
      create: { memoRunId, ...decisionSummary },
      update: { ...decisionSummary },
    });

    for (const risk of output.keyRisks) {
      const citation = risk.citation ? await createCitation(tx, memoRunId, risk.citation) : null;
      await tx.keyRisk.create({
        data: {
          memoRunId,
          citationId: citation?.id,
          description: risk.description,
          label: risk.label,
        },
      });
    }

    for (const recommendation of output.routeRecommendations) {
      await tx.routeRecommendation.create({
        data: {
          memoRunId,
          description: recommendation.description,
          label: recommendation.label,
        },
      });
    }
  });
}

export type DecisionSummaryRecord = Prisma.MemoRunGetPayload<{
  select: { asOfDate: true; elapsedMs: true; generatedAt: true; decisionSummary: true };
}>;

export async function getDecisionSummary(memoRunId: string): Promise<DecisionSummaryRecord | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: { asOfDate: true, elapsedMs: true, generatedAt: true, decisionSummary: true },
  });
}

export type KeyRisksAndRecommendations = Prisma.MemoRunGetPayload<{
  select: {
    keyRisks: { include: { citation: true } };
    routeRecommendations: true;
  };
}>;

export async function getKeyRisksAndRecommendations(
  memoRunId: string
): Promise<KeyRisksAndRecommendations | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: {
      keyRisks: { include: { citation: true } },
      routeRecommendations: true,
    },
  });
}

// Source Index (PRODUCT_BRIEF.md memo section 10) — every citation
// recorded for this run, across every agent, in one place with access
// dates. Every persist* function above creates its citations through the
// shared createCitation helper against this same memoRunId, so a plain
// findMany is the complete index — no per-agent aggregation needed.
export async function getSourceIndex(memoRunId: string) {
  return db.citation.findMany({
    where: { memoRunId },
    orderBy: { accessedDate: "desc" },
  });
}

// Live per-agent progress (USER_STORIES.md Story 2). Not agent output —
// just a status row updated as runOrchestrator's onAgentStatusChange
// callback fires. AGENT_ROSTER (lib/agents/roster.ts) is the canonical
// list of agentName keys these rows use.

export async function initializeAgentProgress(memoRunId: string, agentKeys: string[]): Promise<void> {
  await db.$transaction([
    db.memoRun.update({ where: { id: memoRunId }, data: { assessmentStartedAt: new Date() } }),
    ...agentKeys.map((agentName) =>
      db.agentProgress.upsert({
        where: { memoRunId_agentName: { memoRunId, agentName } },
        create: { memoRunId, agentName, status: "Queued", attempt: 0 },
        update: { status: "Queued", attempt: 0, startedAt: null, completedAt: null, note: null },
      })
    ),
  ]);
}

export async function upsertAgentRunStatus(
  memoRunId: string,
  agentName: string,
  status: AgentLiveStatus,
  attempt: number,
  note?: string
): Promise<void> {
  const isTerminal = status === "Complete" || status === "Failed";
  await db.agentProgress.upsert({
    where: { memoRunId_agentName: { memoRunId, agentName } },
    create: {
      memoRunId,
      agentName,
      status,
      attempt,
      note,
      startedAt: status === "Running" ? new Date() : undefined,
      completedAt: isTerminal ? new Date() : undefined,
    },
    update: {
      status,
      attempt,
      note,
      ...(status === "Running" ? { startedAt: new Date() } : {}),
      ...(isTerminal ? { completedAt: new Date() } : {}),
    },
  });
}

export type AgentProgressState = Prisma.MemoRunGetPayload<{
  select: { assessmentStartedAt: true; agentProgress: true };
}>;

export async function getAgentProgress(memoRunId: string): Promise<AgentProgressState | null> {
  return db.memoRun.findUnique({
    where: { id: memoRunId },
    select: { assessmentStartedAt: true, agentProgress: true },
  });
}
