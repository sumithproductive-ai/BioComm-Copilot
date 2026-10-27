// Deterministic rNPV calculator — deliberately NOT an LLM call. The rNPV
// Agent (rnpv.ts) drafts and cites the underlying assumptions (phase
// probabilities, costs, pricing, timeline, discount rate); this module does
// the actual multi-year, probability-weighted discounting arithmetic. Same
// "boring and explainable" principle synthesis.ts already applies to the
// Confidence Score — compounding a discount rate across 8-12 years and a
// multi-gate probability tree is exactly the class of arithmetic where LLMs
// quietly drift, and a valuation number is worth more when it's
// reproducible from its own inputs than when it merely looks plausible.
//
// This is a simplified, standard-shape rNPV model (development-cost years,
// a linear commercial ramp, a flat hold through patent exclusivity, then a
// 3-year generic-erosion tail folded into terminal value) — not a full
// 3-statement financial model. Spreadsheet-precision modeling would imply a
// level of confidence the underlying assumptions (wide low/high ranges,
// preclinical-stage data) don't support.

import type {
  FinancialAssumptions,
  FinancialAssumptionsOverride,
  PlausibilityWarning,
  RnpvComputed,
  SensitivityScenario,
  YearlyCashFlow,
} from "./schemas";

type ScenarioConfig = {
  scenario: "Conservative" | "Base" | "Aggressive";
  penetrationFactor: number; // 0 = low end of the range, 1 = high end
  priceFactor: number; // 0 = low end of the range, 1 = high end
  probabilityMultiplier: number; // applied to every phase probability, then clamped to [0,1]
  discountRateDeltaPercent: number; // added to discountRatePercent before clamping to [0,100]
  description: string;
};

const SCENARIOS: ScenarioConfig[] = [
  {
    scenario: "Conservative",
    penetrationFactor: 0,
    priceFactor: 0,
    probabilityMultiplier: 0.8,
    discountRateDeltaPercent: 5,
    description:
      "Low end of penetration/pricing ranges, phase probabilities cut 20%, discount rate +5 points.",
  },
  {
    scenario: "Base",
    penetrationFactor: 0.5,
    priceFactor: 0.5,
    probabilityMultiplier: 1,
    discountRateDeltaPercent: 0,
    description: "Midpoint of penetration/pricing ranges, phase probabilities and discount rate as estimated.",
  },
  {
    scenario: "Aggressive",
    penetrationFactor: 1,
    priceFactor: 1,
    probabilityMultiplier: 1.15,
    discountRateDeltaPercent: -3,
    description:
      "High end of penetration/pricing ranges, phase probabilities up 15% (capped at 1.0), discount rate -3 points.",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(low: number, high: number, factor: number): number {
  return low + (high - low) * factor;
}

type ModelResult = {
  yearlyCashFlows: YearlyCashFlow[];
  terminalValueUsd: number;
  totalRnpvUsd: number;
  overallProbabilityOfSuccess: number;
};

function runModel(
  assumptions: FinancialAssumptions,
  config: Pick<
    ScenarioConfig,
    "penetrationFactor" | "priceFactor" | "probabilityMultiplier" | "discountRateDeltaPercent"
  >
): ModelResult {
  const discountRate = clamp(assumptions.discountRatePercent + config.discountRateDeltaPercent, 0, 100) / 100;

  const adjustedProbabilities = assumptions.phaseProbabilities.map((p) =>
    clamp(p.probability * config.probabilityMultiplier, 0, 1)
  );

  // stageEntryProbabilities[i] = probability of having survived to the
  // START of timeline stage i (product of every gate before it). Reuses the
  // last known gate probability if there are more timeline stages than
  // probability gates, rather than crashing on a length mismatch.
  const stageEntryProbabilities: number[] = [];
  let running = 1;
  for (let i = 0; i < assumptions.timeline.length; i++) {
    stageEntryProbabilities.push(running);
    const gateProbability = adjustedProbabilities[Math.min(i, adjustedProbabilities.length - 1)] ?? 1;
    running *= gateProbability;
  }
  const overallProbabilityOfSuccess = adjustedProbabilities.reduce((product, p) => product * p, 1);

  // Matched by stage name (case-insensitive), not array index — see the
  // schema comment on developmentCostEstimateSchema.stage. A cost entry
  // whose stage name doesn't match any timeline stage contributes nothing
  // rather than throwing; malformed input should degrade the number, not
  // crash the run.
  const costByStage = new Map(
    assumptions.developmentCosts.map((c) => [c.stage.toLowerCase().trim(), (c.lowUsd + c.highUsd) / 2])
  );

  const yearlyCashFlows: YearlyCashFlow[] = [];
  let yearCounter = 0;

  assumptions.timeline.forEach((stage, i) => {
    const totalCost = costByStage.get(stage.stage.toLowerCase().trim()) ?? 0;
    const wholeYears = Math.max(1, Math.round(stage.durationYears));
    const annualCost = totalCost / wholeYears;
    const entryProbability = stageEntryProbabilities[i];
    for (let y = 0; y < wholeYears; y++) {
      yearCounter++;
      const grossCashFlow = -annualCost;
      const probabilityAdjusted = grossCashFlow * entryProbability;
      const discountedPresentValue = probabilityAdjusted / Math.pow(1 + discountRate, yearCounter);
      yearlyCashFlows.push({
        year: yearCounter,
        stage: stage.stage,
        grossCashFlowUsd: Math.round(grossCashFlow),
        cumulativeProbability: entryProbability,
        probabilityAdjustedCashFlowUsd: Math.round(probabilityAdjusted),
        discountedPresentValueUsd: Math.round(discountedPresentValue),
      });
    }
  });

  const { revenueAssumptions, exclusivityYears } = assumptions;
  const penetration = lerp(
    revenueAssumptions.peakPenetrationRateLow,
    revenueAssumptions.peakPenetrationRateHigh,
    config.penetrationFactor
  );
  const price = lerp(
    revenueAssumptions.pricePerPatientUsdLow,
    revenueAssumptions.pricePerPatientUsdHigh,
    config.priceFactor
  );
  const peakAnnualRevenue = revenueAssumptions.treatablePopulationCount * penetration * price;

  const rampYears = Math.max(1, Math.round(revenueAssumptions.yearsToPeakSales));
  const holdYears = Math.max(0, Math.round(exclusivityYears) - rampYears);

  for (let y = 1; y <= rampYears; y++) {
    yearCounter++;
    const revenue = peakAnnualRevenue * (y / rampYears);
    const probabilityAdjusted = revenue * overallProbabilityOfSuccess;
    const discountedPresentValue = probabilityAdjusted / Math.pow(1 + discountRate, yearCounter);
    yearlyCashFlows.push({
      year: yearCounter,
      stage: "Commercial ramp",
      grossCashFlowUsd: Math.round(revenue),
      cumulativeProbability: overallProbabilityOfSuccess,
      probabilityAdjustedCashFlowUsd: Math.round(probabilityAdjusted),
      discountedPresentValueUsd: Math.round(discountedPresentValue),
    });
  }

  for (let y = 0; y < holdYears; y++) {
    yearCounter++;
    const probabilityAdjusted = peakAnnualRevenue * overallProbabilityOfSuccess;
    const discountedPresentValue = probabilityAdjusted / Math.pow(1 + discountRate, yearCounter);
    yearlyCashFlows.push({
      year: yearCounter,
      stage: "Peak sales (exclusivity)",
      grossCashFlowUsd: Math.round(peakAnnualRevenue),
      cumulativeProbability: overallProbabilityOfSuccess,
      probabilityAdjustedCashFlowUsd: Math.round(probabilityAdjusted),
      discountedPresentValueUsd: Math.round(discountedPresentValue),
    });
  }

  // Post-exclusivity decline tail — a standard step-down convention
  // (60%/30%/15% of peak over 3 years) standing in for generic/biosimilar
  // erosion, folded into terminalValueUsd rather than the main yearly table
  // since it's a simplifying convention, not a claim about specific future
  // years.
  const decayFractions = [0.6, 0.3, 0.15];
  let terminalValueUsd = 0;
  decayFractions.forEach((fraction, idx) => {
    const year = yearCounter + idx + 1;
    const revenue = peakAnnualRevenue * fraction;
    const probabilityAdjusted = revenue * overallProbabilityOfSuccess;
    terminalValueUsd += probabilityAdjusted / Math.pow(1 + discountRate, year);
  });

  const totalRnpvUsd = Math.round(
    yearlyCashFlows.reduce((sum, row) => sum + row.discountedPresentValueUsd, 0) + terminalValueUsd
  );

  return {
    yearlyCashFlows,
    terminalValueUsd: Math.round(terminalValueUsd),
    totalRnpvUsd,
    overallProbabilityOfSuccess,
  };
}

// Stages where the asset has not yet reached market — used to gate the
// discount-rate and overall-probability checks below, since "too low a
// discount rate" and "too high a probability of success" are only
// implausible *before* approval; an Approved asset legitimately clears
// both. Matches STAGE_OPTIONS in lib/validations/therapy-profile.ts minus
// "Approved".
const UNAPPROVED_STAGES = ["Preclinical", "Phase 1", "Phase 2", "Phase 3"];

// Deterministic plausibility backstop — see schemas.ts's comment on
// plausibilityWarningSchema for why this exists alongside (not instead of)
// Critic's own UnrealisticFinancialAssumption check. Thresholds come
// directly from the rNPV Agent's own system prompt guidance (rnpv.ts) and
// standard industry rules of thumb: this just makes a few of those rules
// unconditionally enforced in code rather than guidance the model can
// drift from under its own reasoning.
function checkPlausibility(
  assumptions: FinancialAssumptions,
  overallProbabilityOfSuccess: number,
  stage: string
): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = [];
  const { revenueAssumptions, discountRatePercent, exclusivityYears } = assumptions;
  const isUnapproved = UNAPPROVED_STAGES.includes(stage);

  if (revenueAssumptions.peakPenetrationRateHigh > 0.1) {
    warnings.push({
      field: "peakPenetrationRateHigh",
      severity: "Flag",
      message: `Peak penetration high end of ${(revenueAssumptions.peakPenetrationRateHigh * 100).toFixed(1)}% is well above the ~1-5% typical for a first-in-class asset — treat as an outlier case, not the base case, unless explicitly justified.`,
    });
  }

  // Catches a failure mode the penetration-rate check above can miss:
  // treatablePopulationCount and peakPenetrationRateHigh can each look
  // individually reasonable (e.g. a "broad but real" population x a
  // textbook 1-5% penetration) while their product is still an implausible
  // absolute patient count — confirmed live (2026-10) against a real run
  // that combined a 15M-patient population with 2-3% penetration, implying
  // ~300-450K patients/year treated at peak for a first-in-class,
  // integrating-vector gene therapy, roughly 6-9x a real worked precedent
  // for this same asset class (~50,000/year).
  const impliedPeakPatients =
    revenueAssumptions.treatablePopulationCount * revenueAssumptions.peakPenetrationRateHigh;
  if (impliedPeakPatients > 200_000) {
    warnings.push({
      field: "treatablePopulationCount",
      severity: "Note",
      message: `treatablePopulationCount (${revenueAssumptions.treatablePopulationCount.toLocaleString()}) x peak penetration high end (${(revenueAssumptions.peakPenetrationRateHigh * 100).toFixed(1)}%) implies ~${Math.round(impliedPeakPatients).toLocaleString()} patients treated per year at peak — unusually large for a first-in-class asset. Each input can look individually reasonable while their product overstates absolute reach; confirm the population was narrowed to a specific defensible subgroup rather than a broad epidemiological total.`,
    });
  }

  // Threshold updated (2026-10) alongside rnpv.ts's VALUATION_METHODOLOGY:
  // a 10% rate is now the stated base case (technical/failure risk is
  // captured by the phase-probability chain, not the discount rate — a
  // blanket high rate on top of that double-counts risk), so this only
  // flags a rate genuinely below any defensible floor, not merely below
  // the old 15-25% guidance that this check used to enforce.
  if (isUnapproved && discountRatePercent < 6) {
    warnings.push({
      field: "discountRatePercent",
      severity: "Flag",
      message: `A ${discountRatePercent}% discount rate is unusually low even for a risk-adjusted (rNPV) model for a ${stage} asset — biopharma rNPV surveys cite a median around 10%; a rate this low likely understates even time-value/commercial risk, separate from the technical risk already captured in the phase probabilities.`,
    });
  } else if (discountRatePercent > 35) {
    warnings.push({
      field: "discountRatePercent",
      severity: "Note",
      message: `A ${discountRatePercent}% discount rate is unusually high and may be effectively zeroing out long-dated cash flows — confirm this wasn't a data-entry error.`,
    });
  }

  if (isUnapproved && overallProbabilityOfSuccess > 0.5) {
    warnings.push({
      field: "overallProbabilityOfSuccess",
      severity: "Flag",
      message: `An overall probability of success of ${(overallProbabilityOfSuccess * 100).toFixed(1)}% is far above the ~5-15% typical composite preclinical/early-clinical-to-approval odds for biotech — the underlying phase probabilities are likely too optimistic.`,
    });
  } else if (isUnapproved && overallProbabilityOfSuccess < 0.03) {
    // Symmetric counterpart to the >50% Flag above — confirmed live
    // (2026-10) against a real run that landed at 2.15%/0.315% cumulative
    // POS on two separate passes for the same preclinical asset, well
    // below the ~5-15% typical composite range the rNPV Agent's own system
    // prompt (rnpv.ts's VALUATION_METHODOLOGY) is now anchored to. Note,
    // not Flag — unlike the >50% case, a genuinely higher-risk asset can
    // legitimately sit below the typical band, so this is "worth
    // double-checking the stage-by-stage reasoning," not "clearly wrong."
    warnings.push({
      field: "overallProbabilityOfSuccess",
      severity: "Note",
      message: `An overall probability of success of ${(overallProbabilityOfSuccess * 100).toFixed(2)}% is below the ~5-15% typical composite preclinical-to-approval range for biotech — confirm each stage-by-stage probability is grounded in a real benchmark rather than defaulting toward the conservative end, especially the earliest gate (it compounds into every later number).`,
    });
  }

  if (exclusivityYears > 20) {
    warnings.push({
      field: "exclusivityYears",
      severity: "Note",
      message: `${exclusivityYears} years of commercial exclusivity exceeds a typical patent term (20 years from filing, commonly ~8-12 years of actual post-approval runway) — confirm this accounts for time already elapsed and any patent term extensions, not the full statutory term.`,
    });
  } else if (exclusivityYears < 3) {
    warnings.push({
      field: "exclusivityYears",
      severity: "Note",
      message: `${exclusivityYears} years of exclusivity is unusually short — confirm this wasn't a data-entry error.`,
    });
  }

  return warnings;
}

// Merges a user-supplied override on top of the AI-drafted assumptions so
// computeRnpv can be run a second time against the user's own numbers — same
// calculator, same clamping/scenario logic, just different inputs. Phase
// probabilities are replaced wholesale (not merged gate-by-gate): the user's
// gate chain may have a different number of stages than the AI drafted, and
// partially splicing the two would produce a probability tree that matches
// neither source. developmentCosts, timeline, and revenueAssumptions are
// left as the AI drafted them (out of scope for this override — see the
// "High-leverage only" scope decision), so the two totals aren't a pure A/B
// on probability/discount/exclusivity alone, but they isolate the three
// inputs most likely to explain a gap against an external valuation.
export function applyFinancialAssumptionsOverride(
  assumptions: FinancialAssumptions,
  override: FinancialAssumptionsOverride
): FinancialAssumptions {
  return {
    ...assumptions,
    phaseProbabilities: override.phaseProbabilities
      ? override.phaseProbabilities.map((gate) => ({
          fromStage: gate.fromStage,
          toStage: gate.toStage,
          probability: gate.probability,
          label: "Fact" as const,
          rationale: "User-provided — supplied directly rather than drafted from industry benchmarks.",
        }))
      : assumptions.phaseProbabilities,
    discountRatePercent: override.discountRatePercent ?? assumptions.discountRatePercent,
    discountRateRationale:
      override.discountRatePercent !== undefined
        ? "User-provided discount rate."
        : assumptions.discountRateRationale,
    exclusivityYears: override.exclusivityYears ?? assumptions.exclusivityYears,
    exclusivityYearsRationale:
      override.exclusivityYears !== undefined
        ? "User-provided exclusivity estimate."
        : assumptions.exclusivityYearsRationale,
  };
}

export function computeRnpv(assumptions: FinancialAssumptions, stage: string): RnpvComputed {
  const baseConfig = SCENARIOS.find((s) => s.scenario === "Base");
  if (!baseConfig) throw new Error("rnpv-calc: Base scenario config missing");
  const baseResult = runModel(assumptions, baseConfig);

  const sensitivityScenarios: SensitivityScenario[] = SCENARIOS.map((config) => {
    const result = config.scenario === "Base" ? baseResult : runModel(assumptions, config);
    return {
      scenario: config.scenario,
      keyAssumptionChanges: config.description,
      rnpvUsd: result.totalRnpvUsd,
    };
  });

  const plausibilityWarnings = checkPlausibility(assumptions, baseResult.overallProbabilityOfSuccess, stage);

  return {
    yearlyCashFlows: baseResult.yearlyCashFlows,
    terminalValueUsd: baseResult.terminalValueUsd,
    totalRnpvUsd: baseResult.totalRnpvUsd,
    overallProbabilityOfSuccess: baseResult.overallProbabilityOfSuccess,
    sensitivityScenarios,
    plausibilityWarnings,
  };
}
