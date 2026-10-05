import { ClaimLabelBadge } from "@/components/claim-label-badge";
import { Badge } from "@/components/ui/badge";
import type { RnpvOutput } from "@/lib/agents/schemas";

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function CitationLink({ citation }: { citation?: { sourceUrl: string; sourceType: string } }) {
  if (!citation) return null;
  return (
    <a
      href={citation.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-brand-navy"
    >
      Source ({citation.sourceType})
    </a>
  );
}

const SCENARIO_STYLES: Record<string, string> = {
  Conservative: "border-slate-200 bg-slate-50 text-slate-700",
  Base: "border-blue-200 bg-blue-50 text-blue-700",
  Aggressive: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function FinancialValuationSection({ data }: { data: RnpvOutput }) {
  const { assumptions, computed, benchmarkingNotes, methodologyNote } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[9px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        {methodologyNote}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Valuation Range (Risk-Adjusted NPV)
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {computed.sensitivityScenarios.map((scenario) => (
            <div
              key={scenario.scenario}
              className="rounded-[9px] border border-border bg-white px-3 py-3 text-center"
            >
              <Badge
                variant="outline"
                className={SCENARIO_STYLES[scenario.scenario] ?? ""}
              >
                {scenario.scenario}
              </Badge>
              <p className="mt-2 text-lg font-bold text-brand-navy">{formatUsd(scenario.rnpvUsd)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{scenario.keyAssumptionChanges}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Overall probability of technical/regulatory/commercial success:{" "}
          {(computed.overallProbabilityOfSuccess * 100).toFixed(1)}% · Terminal value:{" "}
          {formatUsd(computed.terminalValueUsd)}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Phase Probabilities
        </h3>
        <div className="flex flex-col gap-2">
          {assumptions.phaseProbabilities.map((p, i) => (
            <div key={i} className="rounded-[9px] border border-border bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-navy">
                  {p.fromStage} → {p.toStage}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold">{(p.probability * 100).toFixed(0)}%</span>
                  <ClaimLabelBadge label={p.label} />
                </div>
              </div>
              <p className="mt-1 text-sm text-foreground">{p.rationale}</p>
              <div className="mt-1.5">
                <CitationLink citation={p.citation} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Revenue Assumptions
        </h3>
        <div className="rounded-[9px] border border-border bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-brand-navy">
              {assumptions.revenueAssumptions.treatablePopulationCount.toLocaleString()} patients —{" "}
              {assumptions.revenueAssumptions.treatablePopulationDescription}
            </p>
            <ClaimLabelBadge label={assumptions.revenueAssumptions.treatablePopulationLabel} />
          </div>
          <p className="mt-2 text-sm text-foreground">
            Peak penetration: {(assumptions.revenueAssumptions.peakPenetrationRateLow * 100).toFixed(1)}%–
            {(assumptions.revenueAssumptions.peakPenetrationRateHigh * 100).toFixed(1)}% · Price per patient:{" "}
            {formatUsd(assumptions.revenueAssumptions.pricePerPatientUsdLow)}–
            {formatUsd(assumptions.revenueAssumptions.pricePerPatientUsdHigh)} · Years to peak sales:{" "}
            {assumptions.revenueAssumptions.yearsToPeakSales}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <ClaimLabelBadge label={assumptions.revenueAssumptions.label} />
            <CitationLink citation={assumptions.revenueAssumptions.citation} />
            <CitationLink citation={assumptions.revenueAssumptions.treatablePopulationCitation} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Development Costs &amp; Timeline
        </h3>
        <div className="flex flex-col gap-2">
          {assumptions.timeline.map((stage, i) => {
            const cost = assumptions.developmentCosts.find(
              (c) => c.stage.toLowerCase().trim() === stage.stage.toLowerCase().trim()
            );
            return (
              <div key={i} className="rounded-[9px] border border-border bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{stage.stage}</p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {stage.durationYears} year{stage.durationYears === 1 ? "" : "s"}
                  </span>
                </div>
                {cost && (
                  <p className="mt-1 text-sm text-foreground">
                    Estimated cost: {formatUsd(cost.lowUsd)}–{formatUsd(cost.highUsd)}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <ClaimLabelBadge label={stage.label} />
                  <CitationLink citation={stage.citation} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Discount rate: {assumptions.discountRatePercent}% — {assumptions.discountRateRationale} ·
          Exclusivity: {assumptions.exclusivityYears} years
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Yearly Cash Flow (Base Case)
        </h3>
        <div className="overflow-x-auto rounded-[9px] border border-border bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Gross Cash Flow</th>
                <th className="px-3 py-2 font-medium">Cumulative Prob.</th>
                <th className="px-3 py-2 font-medium">Prob-Adjusted</th>
                <th className="px-3 py-2 font-medium">PV</th>
              </tr>
            </thead>
            <tbody>
              {computed.yearlyCashFlows.map((row) => (
                <tr key={row.year} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.year}</td>
                  <td className="px-3 py-2">{row.stage}</td>
                  <td className="px-3 py-2">{formatUsd(row.grossCashFlowUsd)}</td>
                  <td className="px-3 py-2">{(row.cumulativeProbability * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{formatUsd(row.probabilityAdjustedCashFlowUsd)}</td>
                  <td className="px-3 py-2 font-medium text-brand-navy">
                    {formatUsd(row.discountedPresentValueUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Benchmarking
          </h3>
          <ClaimLabelBadge label={benchmarkingNotes.label} />
        </div>
        <p className="text-sm text-foreground">{benchmarkingNotes.summary}</p>
      </div>
    </div>
  );
}
