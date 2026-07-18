import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  getClinicalLandscape,
  getCompetitiveLandscape,
  getCommercialOpportunity,
  getRegulatoryLandscape,
  getDealComparablesLandscape,
} from "@/lib/agents/persist";
import { Card, CardContent } from "@/components/ui/card";
import { RecordRecentRun } from "@/components/record-recent-run";
import { RunAssessmentButton } from "@/components/run-assessment-button";
import { ClinicalLandscapeSection } from "@/components/clinical-landscape";
import { CompetitiveLandscapeSection } from "@/components/competitive-landscape";
import { CommercialOpportunitySection } from "@/components/commercial-opportunity";
import { RegulatoryLandscapeSection } from "@/components/regulatory-landscape";
import { DealComparablesSection } from "@/components/deal-comparables";

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
  ] = await Promise.all([
    getClinicalLandscape(id),
    getCompetitiveLandscape(id),
    getCommercialOpportunity(id),
    getRegulatoryLandscape(id),
    getDealComparablesLandscape(id),
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
  const hasAnyResults =
    hasClinicalResearch ||
    hasCompetitiveIntelligence ||
    hasCommercialOpportunity ||
    hasRegulatory ||
    hasDealComparables;

  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
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
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">
          {hasAnyResults ? "Assessment in progress" : "Assessment queued"}
        </p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
          {memoRun.target}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {memoRun.modality} · {memoRun.stage} · {memoRun.indication}
        </p>

        <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
          <CardContent className="flex flex-col gap-4">
            {memoRun.context && (
              <p className="text-sm text-muted-foreground">{memoRun.context}</p>
            )}
            {!hasAnyResults && (
              <>
                <p className="text-sm text-muted-foreground">
                  All 5 research agents are wired up — Clinical Research,
                  Competitive Intelligence, Commercial Opportunity,
                  Regulatory, and Deal Comparables. Critic and Synthesis
                  aren&apos;t built yet. This runs five real agents
                  concurrently against live ClinicalTrials.gov, PubMed, and
                  web search data, not a demo.
                </p>
                <RunAssessmentButton memoRunId={memoRun.id} />
              </>
            )}
          </CardContent>
        </Card>

        {hasClinicalResearch && clinicalLandscape && (
          <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
            <CardContent>
              <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                Clinical Landscape
              </h2>
              <ClinicalLandscapeSection data={clinicalLandscape} />
            </CardContent>
          </Card>
        )}

        {hasCompetitiveIntelligence && competitiveLandscape && (
          <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
            <CardContent>
              <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                Competitive Landscape
              </h2>
              <CompetitiveLandscapeSection data={competitiveLandscape} />
            </CardContent>
          </Card>
        )}

        {hasCommercialOpportunity && commercialOpportunity && (
          <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
            <CardContent>
              <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                Commercial Opportunity
              </h2>
              <CommercialOpportunitySection data={commercialOpportunity} />
            </CardContent>
          </Card>
        )}

        {hasRegulatory && regulatoryLandscape && (
          <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
            <CardContent>
              <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                Regulatory Landscape
              </h2>
              <RegulatoryLandscapeSection data={regulatoryLandscape} />
            </CardContent>
          </Card>
        )}

        {hasDealComparables && dealComparablesLandscape && (
          <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
            <CardContent>
              <h2 className="mb-4 text-[19px] font-bold text-brand-navy">
                Deal Comparables
              </h2>
              <DealComparablesSection data={dealComparablesLandscape} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
