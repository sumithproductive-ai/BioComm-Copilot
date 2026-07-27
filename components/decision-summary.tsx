import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ConfidenceBreakdownChart } from "@/components/confidence-breakdown-chart";
import type { DecisionSummaryRecord } from "@/lib/agents/persist";

// USER_STORIES.md Story 3 AC: "Confidence Score derivation method is
// documented and consistent across runs" — AGENT_PLAN.md §5.1's exact
// weighted formula, kept in sync with lib/agents/synthesis.ts's
// computeDecisionSummary. Showing the real sub-scores (not just the final
// number) is what makes this "boring and explainable" rather than a
// black box.
const CONFIDENCE_COMPONENTS: {
  key: keyof Pick<
    NonNullable<DecisionSummaryRecord["decisionSummary"]>,
    | "clinicalDataCompleteness"
    | "competitiveCoverageCompleteness"
    | "commercialSourceQuality"
    | "regulatoryPrecedentStrength"
    | "inverseCriticFlagSeverity"
  >;
  label: string;
  weight: string;
}[] = [
  { key: "clinicalDataCompleteness", label: "Clinical data completeness", weight: "25%" },
  { key: "competitiveCoverageCompleteness", label: "Competitive coverage", weight: "20%" },
  { key: "commercialSourceQuality", label: "Commercial source quality", weight: "20%" },
  { key: "regulatoryPrecedentStrength", label: "Regulatory precedent strength", weight: "20%" },
  { key: "inverseCriticFlagSeverity", label: "Critic review severity (inverse)", weight: "15%" },
];

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

// Design-reference "Overall Signal" gauge — a second view of the same
// confidenceScore, banded into Low/Moderate/High using the exact same 4/7
// thresholds lib/agents/synthesis.ts's recommendedNextStep already uses, so
// the gauge and the Recommended Next Step tile can never visually disagree.
const SIGNAL_BANDS = [
  { label: "Low", activeClass: "bg-red-500", textClass: "text-red-700" },
  { label: "Moderate", activeClass: "bg-amber-500", textClass: "text-amber-700" },
  { label: "High", activeClass: "bg-emerald-500", textClass: "text-emerald-700" },
] as const;

function signalBandIndex(confidenceScore: number): number {
  if (confidenceScore >= 7) return 2;
  if (confidenceScore >= 4) return 1;
  return 0;
}

// Story 13 AC: "Time is shown in minutes and seconds (e.g. 'Generated in
// 14m 32s')". Story 10 AC: "As-of date is displayed at the top of each
// memo section" (ERD.md simplifies this to one stamp on the run rather than
// literally every section — ERD.md's own design note). Both asOfDate and
// elapsedMs were already computed by Synthesis, persisted, and fetched all
// the way to this component's props — just never rendered until now
// (comprehensive review, 2026-07-25).
function formatElapsedLabel(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Generated in ${minutes}m ${seconds}s`;
}

function formatAsOfDate(asOfDate: Date): string {
  return asOfDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function StatTile({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex flex-col gap-1 rounded-[9px] border border-border bg-white px-4 py-3 transition-colors hover:border-brand-navy/30"
    >
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </a>
  );
}

export function DecisionSummarySection({ data }: { data: DecisionSummaryRecord }) {
  const summary = data.decisionSummary;
  if (!summary) return null;

  const confidenceScore = Number(summary.confidenceScore);
  const bandIndex = signalBandIndex(confidenceScore);
  const band = SIGNAL_BANDS[bandIndex];

  return (
    <div className="flex flex-col gap-4">
      {(data.asOfDate || data.elapsedMs != null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {data.asOfDate && <span>As of {formatAsOfDate(data.asOfDate)}</span>}
          {data.asOfDate && data.elapsedMs != null && <span aria-hidden>·</span>}
          {data.elapsedMs != null && <span>{formatElapsedLabel(data.elapsedMs)}</span>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Overall Signal
        </span>
        <div className="flex flex-1 gap-1">
          {SIGNAL_BANDS.map((segment, i) => (
            <div
              key={segment.label}
              className={cn("h-2 flex-1 rounded-full", i === bandIndex ? segment.activeClass : "bg-slate-100")}
            />
          ))}
        </div>
        <span className={cn("shrink-0 text-sm font-semibold", band.textClass)}>{band.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile href="#commercial-opportunity" label="Commercial Opportunity">
          <Badge
            variant="outline"
            className={cn("w-fit font-medium", OPPORTUNITY_STYLES[summary.commercialOpportunity] ?? "")}
          >
            {summary.commercialOpportunity}
          </Badge>
        </StatTile>
        <StatTile href="#reviewer-notes" label="Confidence Score">
          <span className="text-lg font-bold text-brand-navy">{confidenceScore.toFixed(1)}/10</span>
        </StatTile>
        <StatTile href="#key-risks" label="Key Risks">
          <span className="text-lg font-bold text-brand-navy">{summary.keyRisksCount}</span>
        </StatTile>
        <StatTile href="#deal-comparables" label="Comparable Deals">
          <span className="text-lg font-bold text-brand-navy">{summary.comparableDealsFoundCount}</span>
        </StatTile>
      </div>

      <a
        href="#key-risks"
        className="flex items-center justify-between rounded-[9px] border border-border bg-white px-4 py-3 transition-colors hover:border-brand-navy/30"
      >
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Recommended Next Step
        </span>
        <Badge variant="secondary">
          {NEXT_STEP_LABELS[summary.recommendedNextStep] ?? summary.recommendedNextStep}
        </Badge>
      </a>

      <details className="rounded-[9px] border border-border bg-white px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          How Confidence Score is calculated
        </summary>
        <div className="mt-3">
          <ConfidenceBreakdownChart
            data={CONFIDENCE_COMPONENTS.map((component) => ({
              label: `${component.label} (${component.weight})`,
              value: Number(summary[component.key]),
            }))}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            A rule-based weighted average, computed in code from the other agents&apos; already-validated
            outputs — never an LLM-guessed number.
          </p>
        </div>
      </details>
    </div>
  );
}
