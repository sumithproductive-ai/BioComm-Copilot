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

import type { FinancialAssumptions, RnpvComputed, SensitivityScenario, YearlyCashFlow } from "./schemas";

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

export function computeRnpv(assumptions: FinancialAssumptions): RnpvComputed {
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

  return {
    yearlyCashFlows: baseResult.yearlyCashFlows,
    terminalValueUsd: baseResult.terminalValueUsd,
    totalRnpvUsd: baseResult.totalRnpvUsd,
    overallProbabilityOfSuccess: baseResult.overallProbabilityOfSuccess,
    sensitivityScenarios,
  };
}
