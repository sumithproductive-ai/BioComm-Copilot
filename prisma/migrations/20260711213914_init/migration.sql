-- CreateEnum
CREATE TYPE "ClaimLabel" AS ENUM ('Fact', 'Assumption', 'Inference', 'Unknown');

-- CreateEnum
CREATE TYPE "CommercialOpportunityRating" AS ENUM ('High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "RecommendedNextStep" AS ENUM ('ContinueDiligence', 'GatherMoreData', 'DoNotPursue');

-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('Active', 'Completed', 'Terminated', 'Recruiting');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('License', 'Acquisition');

-- CreateEnum
CREATE TYPE "CompStrength" AS ENUM ('Direct', 'Approximate');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('ClinicalTrialsGov', 'Pubmed', 'SecFiling', 'PressRelease', 'FdaLabel', 'FdaGuidance', 'CompanyWebsite', 'News', 'ConferenceAbstract', 'MarketReport', 'AnalystCoverage', 'ApprovalLetter', 'LicensingAnnouncement', 'Other');

-- CreateEnum
CREATE TYPE "CriticFlagType" AS ENUM ('UnsupportedClaim', 'MissingCompetitor', 'AssumptionAsFact', 'UndisclosedTerms', 'StaleData', 'OverconfidentRegulatory', 'Contradiction');

-- CreateTable
CREATE TABLE "memo_run" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "indication" TEXT NOT NULL,
    "context" TEXT,
    "asOfDate" DATE NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "langfuseSessionId" TEXT,
    "mechanismSummary" TEXT,
    "mechanismLabel" "ClaimLabel",
    "patientPopulationValue" TEXT,
    "patientPopulationLabel" "ClaimLabel",
    "patientPopulationCitationId" UUID,
    "unmetNeedSummary" TEXT,
    "marketCrowdingSummary" TEXT,
    "marketCrowdingConsistent" BOOLEAN,
    "differentiationSummary" TEXT,
    "differentiationLabel" "ClaimLabel",
    "developmentTimelineSummary" TEXT,
    "developmentTimelineLabel" "ClaimLabel",
    "noCompFound" BOOLEAN NOT NULL DEFAULT false,
    "noCompExplanation" TEXT,
    "hasCriticalFlags" BOOLEAN NOT NULL DEFAULT false,
    "reviewerNotesSummary" TEXT,

    CONSTRAINT "memo_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_summary" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "commercialOpportunity" "CommercialOpportunityRating" NOT NULL,
    "confidenceScore" DECIMAL(3,1) NOT NULL,
    "clinicalDataCompleteness" DECIMAL(4,3) NOT NULL,
    "competitiveCoverageCompleteness" DECIMAL(4,3) NOT NULL,
    "commercialSourceQuality" DECIMAL(4,3) NOT NULL,
    "regulatoryPrecedentStrength" DECIMAL(4,3) NOT NULL,
    "inverseCriticFlagSeverity" DECIMAL(4,3) NOT NULL,
    "keyRisksCount" INTEGER NOT NULL,
    "comparableDealsFoundCount" INTEGER NOT NULL,
    "recommendedNextStep" "RecommendedNextStep" NOT NULL,

    CONSTRAINT "decision_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citation" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "accessedDate" DATE NOT NULL,
    "publishedDate" DATE,

    CONSTRAINT "citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mechanism_citation" (
    "memoRunId" UUID NOT NULL,
    "citationId" UUID NOT NULL,

    CONSTRAINT "mechanism_citation_pkey" PRIMARY KEY ("memoRunId","citationId")
);

-- CreateTable
CREATE TABLE "trial" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "nctId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" "TrialStatus" NOT NULL,
    "statusAsOfDate" DATE NOT NULL,
    "sponsor" TEXT NOT NULL,
    "enrollment" INTEGER,
    "primaryEndpoint" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_signal" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "description" TEXT NOT NULL,
    "label" "ClaimLabel" NOT NULL,

    CONSTRAINT "safety_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "similar_drug_failure" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "drug" TEXT NOT NULL,
    "reasonForFailure" TEXT NOT NULL,
    "label" "ClaimLabel" NOT NULL,

    CONSTRAINT "similar_drug_failure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_competitor" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "drug" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "mechanism" TEXT NOT NULL,
    "approvalDate" DATE NOT NULL,

    CONSTRAINT "approved_competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "late_stage_pipeline_asset" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "drug" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "mechanism" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "late_stage_pipeline_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positioning_gap" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "label" "ClaimLabel" NOT NULL,

    CONSTRAINT "positioning_gap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unmet_need_citation" (
    "memoRunId" UUID NOT NULL,
    "citationId" UUID NOT NULL,

    CONSTRAINT "unmet_need_citation_pkey" PRIMARY KEY ("memoRunId","citationId")
);

-- CreateTable
CREATE TABLE "comparable_deal" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "asset" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "stageAtDeal" TEXT NOT NULL,
    "dealType" "DealType" NOT NULL,
    "disclosedTerms" TEXT NOT NULL,
    "compStrength" "CompStrength" NOT NULL,

    CONSTRAINT "comparable_deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guidance_document" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,

    CONSTRAINT "guidance_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prior_approval" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "drug" TEXT NOT NULL,
    "approvalDate" DATE NOT NULL,

    CONSTRAINT "prior_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint_precedent" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "sourcedFromLabels" TEXT[],

    CONSTRAINT "endpoint_precedent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint_precedent_citation" (
    "endpointPrecedentId" UUID NOT NULL,
    "citationId" UUID NOT NULL,

    CONSTRAINT "endpoint_precedent_citation_pkey" PRIMARY KEY ("endpointPrecedentId","citationId")
);

-- CreateTable
CREATE TABLE "critic_flag" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "type" "CriticFlagType" NOT NULL,
    "section" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "critic_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_risk" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "description" TEXT NOT NULL,
    "label" "ClaimLabel" NOT NULL,

    CONSTRAINT "key_risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_recommendation" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "label" "ClaimLabel" NOT NULL DEFAULT 'Assumption',

    CONSTRAINT "route_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_summary_memoRunId_key" ON "decision_summary"("memoRunId");

-- AddForeignKey
ALTER TABLE "memo_run" ADD CONSTRAINT "memo_run_patientPopulationCitationId_fkey" FOREIGN KEY ("patientPopulationCitationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_summary" ADD CONSTRAINT "decision_summary_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation" ADD CONSTRAINT "citation_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mechanism_citation" ADD CONSTRAINT "mechanism_citation_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mechanism_citation" ADD CONSTRAINT "mechanism_citation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial" ADD CONSTRAINT "trial_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial" ADD CONSTRAINT "trial_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_signal" ADD CONSTRAINT "safety_signal_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_signal" ADD CONSTRAINT "safety_signal_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similar_drug_failure" ADD CONSTRAINT "similar_drug_failure_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similar_drug_failure" ADD CONSTRAINT "similar_drug_failure_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_competitor" ADD CONSTRAINT "approved_competitor_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_competitor" ADD CONSTRAINT "approved_competitor_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_stage_pipeline_asset" ADD CONSTRAINT "late_stage_pipeline_asset_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_stage_pipeline_asset" ADD CONSTRAINT "late_stage_pipeline_asset_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positioning_gap" ADD CONSTRAINT "positioning_gap_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmet_need_citation" ADD CONSTRAINT "unmet_need_citation_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmet_need_citation" ADD CONSTRAINT "unmet_need_citation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparable_deal" ADD CONSTRAINT "comparable_deal_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparable_deal" ADD CONSTRAINT "comparable_deal_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidance_document" ADD CONSTRAINT "guidance_document_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_approval" ADD CONSTRAINT "prior_approval_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prior_approval" ADD CONSTRAINT "prior_approval_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_precedent" ADD CONSTRAINT "endpoint_precedent_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_precedent_citation" ADD CONSTRAINT "endpoint_precedent_citation_endpointPrecedentId_fkey" FOREIGN KEY ("endpointPrecedentId") REFERENCES "endpoint_precedent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_precedent_citation" ADD CONSTRAINT "endpoint_precedent_citation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critic_flag" ADD CONSTRAINT "critic_flag_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_risk" ADD CONSTRAINT "key_risk_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_risk" ADD CONSTRAINT "key_risk_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_recommendation" ADD CONSTRAINT "route_recommendation_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
