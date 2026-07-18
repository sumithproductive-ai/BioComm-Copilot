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
  CitationRef,
} from "./schemas";

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
