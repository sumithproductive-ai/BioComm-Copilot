import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  getClinicalLandscape,
  getCompetitiveLandscape,
  getCommercialOpportunity,
  getRegulatoryLandscape,
  getDealComparablesLandscape,
  getPatentLandscape,
  getReviewerNotes,
  getDecisionSummary,
  getKeyRisksAndRecommendations,
  getSourceIndex,
  getAgentProgress,
} from "@/lib/agents/persist";
import { computeEpistemicLedger } from "@/lib/memo/epistemic-ledger";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { RecordRecentRun } from "@/components/record-recent-run";
import { AgentProgressSection } from "@/components/agent-progress";
import { ClinicalLandscapeSection } from "@/components/clinical-landscape";
import { CompetitiveLandscapeSection } from "@/components/competitive-landscape";
import { CommercialOpportunitySection } from "@/components/commercial-opportunity";
import { RegulatoryLandscapeSection } from "@/components/regulatory-landscape";
import { DealComparablesSection } from "@/components/deal-comparables";
import { PatentLandscapeSection } from "@/components/patent-landscape";
import { ReviewerNotesSection } from "@/components/reviewer-notes";
import { DecisionSummarySection } from "@/components/decision-summary";
import { KeyRisksSection, RouteRecommendationsSection } from "@/components/key-risks";
import { SourceIndexSection } from "@/components/source-index";
import { EpistemicLedgerSection } from "@/components/epistemic-ledger";
import { MemoToc, type MemoTocSection } from "@/components/memo-toc";
import { CollapsibleSectionCard } from "@/components/collapsible-section-card";
import { DeleteAssessmentButton } from "@/components/delete-assessment-button";
import { isValidUuid } from "@/lib/memo/is-valid-uuid";

const CARD_CLASS =
  "mt-4 scroll-mt-4 [--card-spacing:1.25rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]";

export default async function MemoRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) {
    notFound();
  }
  const memoRun = await db.memoRun.findUnique({ where: { id } });

  if (!memoRun) {
    notFound();
  }

  const [
    clinicalLandscape,
    competitiveLandscape,
    commercialOpportunity,
    regulatoryLandscape,
    dealComparablesLandscape,
    patentLandscape,
    reviewerNotes,
    decisionSummary,
    keyRisksAndRecommendations,
    sourceIndex,
    agentProgress,
  ] = await Promise.all([
    getClinicalLandscape(id),
    getCompetitiveLandscape(id),
    getCommercialOpportunity(id),
    getRegulatoryLandscape(id),
    getDealComparablesLandscape(id),
    getPatentLandscape(id),
    getReviewerNotes(id),
    getDecisionSummary(id),
    getKeyRisksAndRecommendations(id),
    getSourceIndex(id),
    getAgentProgress(id),
  ]);

  const hasClinicalResearch =
    !!clinicalLandscape &&
    (clinicalLandscape.trials.length > 0 || !!clinicalLandscape.mechanismSummary);
  const hasCompetitiveIntelligence =
    !!competitiveLandscape &&
    (competitiveLandscape.approvedCompetitors.length > 0 ||
      competitiveLandscape.lateStagePipelineAssets.length > 0 ||
      competitiveLandscape.positioningGaps.length > 0);
  const hasCommercialOpportunity =
    !!commercialOpportunity &&
    (!!commercialOpportunity.patientPopulationValue ||
      !!commercialOpportunity.unmetNeedSummary ||
      !!commercialOpportunity.marketCrowdingSummary ||
      !!commercialOpportunity.differentiationSummary);
  const hasRegulatory =
    !!regulatoryLandscape &&
    (!!regulatoryLandscape.developmentTimelineSummary ||
      regulatoryLandscape.guidanceDocuments.length > 0 ||
      regulatoryLandscape.priorApprovals.length > 0 ||
      regulatoryLandscape.endpointPrecedents.length > 0);
  const hasDealComparables =
    !!dealComparablesLandscape &&
    (dealComparablesLandscape.noCompFound || dealComparablesLandscape.comparableDeals.length > 0);
  const hasPatents =
    !!patentLandscape &&
    (!!patentLandscape.patentLandscapeSummary || patentLandscape.patents.length > 0);
  // Exactly one of these is set once Critic has actually run (empty-flags
  // runs get the standard-line summary; non-empty runs get flags instead —
  // see persistCriticOutput) — reliably distinguishes "Critic hasn't run
  // yet" from "Critic ran and found nothing".
  const hasReviewerNotes =
    !!reviewerNotes && (!!reviewerNotes.reviewerNotesSummary || reviewerNotes.criticFlags.length > 0);
  const hasDecisionSummary = !!decisionSummary?.decisionSummary;
  const hasKeyRisks = !!keyRisksAndRecommendations && keyRisksAndRecommendations.keyRisks.length > 0;
  const hasRouteRecommendations =
    !!keyRisksAndRecommendations && keyRisksAndRecommendations.routeRecommendations.length > 0;
  const hasSourceIndex = sourceIndex.length > 0;
  const hasAnyResults =
    hasClinicalResearch ||
    hasCompetitiveIntelligence ||
    hasCommercialOpportunity ||
    hasRegulatory ||
    hasDealComparables ||
    hasPatents;
  // Data only persists once the whole Orchestrator run resolves (Story 2 is
  // live *status*, not streamed partial content) — so during a run
  // hasAnyResults stays false the whole time. hasStartedRun is what
  // actually distinguishes "queued" from "in progress".
  const hasStartedRun = !!agentProgress && agentProgress.agentProgress.length > 0;

  const epistemicLedger = computeEpistemicLedger({
    clinical: clinicalLandscape,
    competitive: competitiveLandscape,
    commercial: commercialOpportunity,
    regulatory: regulatoryLandscape,
    keyRisksAndRecommendations,
  });
  const hasEpistemicLedger = epistemicLedger.sampleClaims.length > 0;

  // Section order matches PRODUCT_BRIEF.md's "Full Memo" list (Therapy
  // Profile is the header above, not a numbered section) plus the Epistemic
  // Ledger from the design reference right after Decision Summary — only
  // sections that actually rendered this run get a TOC entry and a number,
  // per the reskin plan.
  const tocSections: MemoTocSection[] = [
    hasDecisionSummary && { id: "decision-summary", label: "Decision Summary" },
    hasEpistemicLedger && { id: "epistemic-ledger", label: "Epistemic Ledger" },
    hasClinicalResearch && { id: "clinical-landscape", label: "Clinical Landscape" },
    hasCompetitiveIntelligence && { id: "competitive-landscape", label: "Competitive Landscape" },
    hasCommercialOpportunity && { id: "commercial-opportunity", label: "Commercial Opportunity" },
    hasDealComparables && { id: "deal-comparables", label: "Deal Comparables" },
    hasRegulatory && { id: "regulatory-pathway", label: "Regulatory Pathway" },
    hasPatents && { id: "patent-landscape", label: "Patent Landscape" },
    hasKeyRisks && { id: "key-risks", label: "Key Risks" },
    hasRouteRecommendations && { id: "route-recommendations", label: "Route Recommendations" },
    hasReviewerNotes && { id: "reviewer-notes", label: "Reviewer Notes" },
    hasSourceIndex && { id: "source-index", label: "Source Index" },
  ].filter((section): section is MemoTocSection => !!section);

  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div
        className={cn(
          "grid w-full max-w-6xl grid-cols-1 gap-10",
          tocSections.length > 0 && "lg:grid-cols-[220px_1fr]"
        )}
      >
        {tocSections.length > 0 && (
          <div className="hidden lg:block">
            <MemoToc sections={tocSections} />
          </div>
        )}

        <div className="w-full max-w-3xl">
          <RecordRecentRun
            run={{
              id: memoRun.id,
              target: memoRun.target,
              modality: memoRun.modality,
              stage: memoRun.stage,
              indication: memoRun.indication,
              createdAt: memoRun.createdAt.toISOString(),
            }}
          />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-brand-amber uppercase" id="therapy-profile">
                {hasDecisionSummary
                  ? "Assessment complete"
                  : hasStartedRun
                    ? "Assessment in progress"
                    : "Assessment queued"}
                {memoRun.deepResearch && (
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700 normal-case">
                    Deep research
                  </span>
                )}
              </p>
              <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
                {memoRun.target}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {memoRun.modality} · {memoRun.stage} · {memoRun.indication}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasDecisionSummary && (
                <a
                  href={`/memo/${memoRun.id}/pdf`}
                  className="rounded-[9px] border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-slate-50"
                >
                  Download PDF
                </a>
              )}
              <Link
                href="/"
                className="rounded-[9px] border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-slate-50"
              >
                + New Assessment
              </Link>
              <DeleteAssessmentButton id={memoRun.id} target={memoRun.target} />
            </div>
          </div>

          {hasAnyResults && (
            <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              This memo is generated from public data sources by AI agents and requires human review
              before use in any decision-making context. Every claim below carries a source and a
              confidence label — verify before relying on it.
            </div>
          )}

          {(memoRun.context || !hasDecisionSummary) && (
            <Card className={CARD_CLASS}>
              <CardContent className="flex flex-col gap-4">
                {memoRun.context && (
                  <p className="text-sm text-muted-foreground">{memoRun.context}</p>
                )}
                {!hasDecisionSummary && (
                  <>
                    {!hasStartedRun && (
                      <p className="text-sm text-muted-foreground">
                        6 research agents run concurrently against live ClinicalTrials.gov, PubMed, SEC
                        EDGAR, EPO patent data, and web search, then Critic review, then Synthesis — not a
                        demo.
                      </p>
                    )}
                    <AgentProgressSection memoRunId={memoRun.id} initialData={agentProgress} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {hasDecisionSummary && decisionSummary && (
            <CollapsibleSectionCard
              id="decision-summary"
              title="Decision Summary"
              cardClassName="border-t-4 border-t-brand-navy"
            >
              <DecisionSummarySection data={decisionSummary} />
            </CollapsibleSectionCard>
          )}

          {hasEpistemicLedger && (
            <CollapsibleSectionCard id="epistemic-ledger" title="Epistemic Ledger">
              <EpistemicLedgerSection data={epistemicLedger} />
            </CollapsibleSectionCard>
          )}

          {hasClinicalResearch && clinicalLandscape && (
            <CollapsibleSectionCard id="clinical-landscape" title="Clinical Landscape">
              <ClinicalLandscapeSection data={clinicalLandscape} />
            </CollapsibleSectionCard>
          )}

          {hasCompetitiveIntelligence && competitiveLandscape && (
            <CollapsibleSectionCard id="competitive-landscape" title="Competitive Landscape">
              <CompetitiveLandscapeSection data={competitiveLandscape} />
            </CollapsibleSectionCard>
          )}

          {hasCommercialOpportunity && commercialOpportunity && (
            <CollapsibleSectionCard id="commercial-opportunity" title="Commercial Opportunity">
              <CommercialOpportunitySection data={commercialOpportunity} />
            </CollapsibleSectionCard>
          )}

          {hasDealComparables && dealComparablesLandscape && (
            <CollapsibleSectionCard id="deal-comparables" title="Deal Comparables">
              <DealComparablesSection data={dealComparablesLandscape} />
            </CollapsibleSectionCard>
          )}

          {hasRegulatory && regulatoryLandscape && (
            <CollapsibleSectionCard id="regulatory-pathway" title="Regulatory Pathway">
              <RegulatoryLandscapeSection data={regulatoryLandscape} />
            </CollapsibleSectionCard>
          )}

          {hasPatents && patentLandscape && (
            <CollapsibleSectionCard id="patent-landscape" title="Patent Landscape">
              <PatentLandscapeSection data={patentLandscape} />
            </CollapsibleSectionCard>
          )}

          {hasKeyRisks && keyRisksAndRecommendations && (
            <CollapsibleSectionCard id="key-risks" title="Key Risks">
              <KeyRisksSection data={keyRisksAndRecommendations} />
            </CollapsibleSectionCard>
          )}

          {hasRouteRecommendations && keyRisksAndRecommendations && (
            <CollapsibleSectionCard id="route-recommendations" title="Preliminary Route Recommendations">
              <RouteRecommendationsSection data={keyRisksAndRecommendations} />
            </CollapsibleSectionCard>
          )}

          {hasReviewerNotes && reviewerNotes && (
            <CollapsibleSectionCard id="reviewer-notes" title="Reviewer Notes">
              <ReviewerNotesSection data={reviewerNotes} />
            </CollapsibleSectionCard>
          )}

          {hasSourceIndex && (
            <CollapsibleSectionCard
              id="source-index"
              title={`Source Index (${sourceIndex.length})`}
              defaultOpen={false}
            >
              <SourceIndexSection citations={sourceIndex} />
            </CollapsibleSectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
