import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EPISTEMIC_LABELS, type EpistemicLedger } from "@/lib/memo/epistemic-ledger";

export type ComparisonSide = {
  memoRun: {
    id: string;
    target: string;
    modality: string;
    stage: string;
    indication: string;
    createdAt: string;
  };
  decisionSummary: {
    commercialOpportunity: string;
    confidenceScore: number;
    recommendedNextStep: string;
    keyRisksCount: number;
    comparableDealsFoundCount: number;
  } | null;
  epistemicLedger: EpistemicLedger;
};

const OPPORTUNITY_STYLES: Record<string, string> = {
  High: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-red-50 text-red-700 border-red-200",
};

const NEXT_STEP_LABELS: Record<string, string> = {
  ContinueDiligence: "Continue diligence",
  GatherMoreData: "Gather more data",
  DoNotPursue: "Do not pursue",
};

const LABEL_BAR_STYLES: Record<string, string> = {
  Fact: "bg-emerald-500",
  Inference: "bg-blue-500",
  Assumption: "bg-amber-500",
  Unknown: "bg-slate-400",
};

function formatDelta(delta: number, digits = 1): string {
  if (delta === 0) return "no change";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(digits)}`;
}

function DeltaBadge({ delta, digits = 1 }: { delta: number; digits?: number }) {
  if (delta === 0) {
    return <Badge variant="outline" className="font-medium text-muted-foreground">no change</Badge>;
  }
  const improved = delta > 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        improved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
      )}
    >
      {improved ? "▲" : "▼"} {formatDelta(delta, digits)}
    </Badge>
  );
}

function SideCard({ side, label }: { side: ComparisonSide; label: string }) {
  const summary = side.decisionSummary;
  const maxCount = Math.max(1, ...EPISTEMIC_LABELS.map((l) => side.epistemicLedger.counts[l]));

  return (
    <div className="rounded-2xl border border-border p-5 shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <Link href={`/memo/${side.memoRun.id}`} className="mt-1 block hover:underline">
        <h2 className="text-lg font-bold text-brand-navy">{side.memoRun.target}</h2>
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {side.memoRun.modality} · {side.memoRun.stage} · {side.memoRun.indication}
      </p>

      {!summary ? (
        <p className="mt-4 rounded-[9px] border border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
          Not yet complete — no Decision Summary to compare.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-[9px] border border-border bg-white px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Opportunity</p>
              <Badge
                variant="outline"
                className={cn("mt-1 font-medium", OPPORTUNITY_STYLES[summary.commercialOpportunity] ?? "")}
              >
                {summary.commercialOpportunity}
              </Badge>
            </div>
            <div className="rounded-[9px] border border-border bg-white px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Confidence</p>
              <p className="mt-1 text-lg font-bold text-brand-navy">{summary.confidenceScore.toFixed(1)}/10</p>
            </div>
            <div className="rounded-[9px] border border-border bg-white px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Key Risks</p>
              <p className="mt-1 text-lg font-bold text-brand-navy">{summary.keyRisksCount}</p>
            </div>
            <div className="rounded-[9px] border border-border bg-white px-3 py-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Comp. Deals</p>
              <p className="mt-1 text-lg font-bold text-brand-navy">{summary.comparableDealsFoundCount}</p>
            </div>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Next step: {NEXT_STEP_LABELS[summary.recommendedNextStep] ?? summary.recommendedNextStep}
          </p>
        </>
      )}

      <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Epistemic Ledger</p>
        {EPISTEMIC_LABELS.map((l) => (
          <div key={l} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{l}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", LABEL_BAR_STYLES[l])}
                style={{ width: `${(side.epistemicLedger.counts[l] / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-5 shrink-0 text-right text-xs font-medium text-foreground">
              {side.epistemicLedger.counts[l]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompareView({ older, newer }: { older: ComparisonSide; newer: ComparisonSide }) {
  const bothComplete = !!older.decisionSummary && !!newer.decisionSummary;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {bothComplete && older.decisionSummary && newer.decisionSummary && (
        <div className="rounded-2xl border border-border bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            What changed (older → newer)
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Commercial Opportunity</span>
              {older.decisionSummary.commercialOpportunity === newer.decisionSummary.commercialOpportunity ? (
                <Badge variant="outline" className="w-fit font-medium text-muted-foreground">
                  no change
                </Badge>
              ) : (
                <Badge variant="outline" className="w-fit font-medium">
                  {older.decisionSummary.commercialOpportunity} → {newer.decisionSummary.commercialOpportunity}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Confidence Score</span>
              <DeltaBadge delta={newer.decisionSummary.confidenceScore - older.decisionSummary.confidenceScore} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Key Risks Count</span>
              <DeltaBadge
                delta={newer.decisionSummary.keyRisksCount - older.decisionSummary.keyRisksCount}
                digits={0}
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SideCard side={older} label="Older" />
        <SideCard side={newer} label="Newer" />
      </div>
    </div>
  );
}
