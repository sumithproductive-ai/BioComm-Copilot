import Link from "next/link";
import { notFound } from "next/navigation";
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
import { ReviewerNotesSection } from "@/components/reviewer-notes";
import { DecisionSummarySection } from "@/components/decision-summary";
import { KeyRisksSection, RouteRecommendationsSection } from "@/components/key-risks";
import { SourceIndexSection } from "@/components/source-index";
import { EpistemicLedgerSection } from "@/components/epistemic-ledger";
import { MemoToc, type MemoTocSection } from "@/components/memo-toc";

const CARD_CLASS =
  "mt-6 scroll-mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]";

export default async function MemoRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    hasDealComparables;
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

        <div className="w-full max-w-2xl">
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
              <p className="text-xs font-bold tracking-wide text-brand-amber uppercase" id="therapy-profile">
                {hasDecisionSummary
                  ? "Assessment complete"
                  : hasStartedRun
                    ? "Assessment in progress"
                    : "Assessment queued"}
              </p>
              <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
                {memoRun.target}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {memoRun.modality} · {memoRun.stage} · {memoRun.indication}
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-[9px] border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-slate-50"
            >
              + New Assessment
            </Link>
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
                        All 5 research agents, the Critic Agent, and the Synthesis
                        Agent are wired up — Clinical Research, Competitive
                        Intelligence, Commercial Opportunity, Regulatory, Deal
                        Comparables, an adversarial review pass, and final memo
                        compilation. This runs five real research agents
                        concurrently against live ClinicalTrials.gov, PubMed, and
                        web search data, then Critic review, then Synthesis — not
                        a demo.
                      </p>
                    )}
                    <AgentProgressSection memoRunId={memoRun.id} initialData={agentProgress} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {hasDecisionSummary && decisionSummary && (
            <Card id="decision-summary" className={cn(CARD_CLASS, "border-t-4 border-t-brand-navy")}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Decision Summary
                </h2>
                <DecisionSummarySection data={decisionSummary} />
              </CardContent>
            </Card>
          )}

          {hasEpistemicLedger && (
            <Card id="epistemic-ledger" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Epistemic Ledger
                </h2>
                <EpistemicLedgerSection data={epistemicLedger} />
              </CardContent>
            </Card>
          )}

          {hasClinicalResearch && clinicalLandscape && (
            <Card id="clinical-landscape" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Clinical Landscape
                </h2>
                <ClinicalLandscapeSection data={clinicalLandscape} />
              </CardContent>
            </Card>
          )}

          {hasCompetitiveIntelligence && competitiveLandscape && (
            <Card id="competitive-landscape" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Competitive Landscape
                </h2>
                <CompetitiveLandscapeSection data={competitiveLandscape} />
              </CardContent>
            </Card>
          )}

          {hasCommercialOpportunity && commercialOpportunity && (
            <Card id="commercial-opportunity" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Commercial Opportunity
                </h2>
                <CommercialOpportunitySection data={commercialOpportunity} />
              </CardContent>
            </Card>
          )}

          {hasDealComparables && dealComparablesLandscape && (
            <Card id="deal-comparables" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Deal Comparables
                </h2>
                <DealComparablesSection data={dealComparablesLandscape} />
              </CardContent>
            </Card>
          )}

          {hasRegulatory && regulatoryLandscape && (
            <Card id="regulatory-pathway" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Regulatory Pathway
                </h2>
                <RegulatoryLandscapeSection data={regulatoryLandscape} />
              </CardContent>
            </Card>
          )}

          {hasKeyRisks && keyRisksAndRecommendations && (
            <Card id="key-risks" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Key Risks
                </h2>
                <KeyRisksSection data={keyRisksAndRecommendations} />
              </CardContent>
            </Card>
          )}

          {hasRouteRecommendations && keyRisksAndRecommendations && (
            <Card id="route-recommendations" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Preliminary Route Recommendations
                </h2>
                <RouteRecommendationsSection data={keyRisksAndRecommendations} />
              </CardContent>
            </Card>
          )}

          {hasReviewerNotes && reviewerNotes && (
            <Card id="reviewer-notes" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Reviewer Notes
                </h2>
                <ReviewerNotesSection data={reviewerNotes} />
              </CardContent>
            </Card>
          )}

          {hasSourceIndex && (
            <Card id="source-index" className={CARD_CLASS}>
              <CardContent>
                <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                  Source Index ({sourceIndex.length})
                </h2>
                <SourceIndexSection citations={sourceIndex} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
