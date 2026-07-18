import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getClinicalLandscape } from "@/lib/agents/persist";
import { Card, CardContent } from "@/components/ui/card";
import { RecordRecentRun } from "@/components/record-recent-run";
import { RunAssessmentButton } from "@/components/run-assessment-button";
import { ClinicalLandscapeSection } from "@/components/clinical-landscape";

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

  const clinicalLandscape = await getClinicalLandscape(id);
  const hasClinicalResearch =
    !!clinicalLandscape &&
    (clinicalLandscape.trials.length > 0 || !!clinicalLandscape.mechanismSummary);

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
          {hasClinicalResearch ? "Assessment in progress" : "Assessment queued"}
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
            {!hasClinicalResearch && (
              <>
                <p className="text-sm text-muted-foreground">
                  Only the Clinical Research Agent is wired up so far —
                  Competitive Intelligence, Commercial Opportunity, Deal
                  Comparables, Regulatory, Critic, and Synthesis aren&apos;t
                  built yet. This runs a real agent against live
                  ClinicalTrials.gov and PubMed data, not a demo.
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
      </div>
    </div>
  );
}
