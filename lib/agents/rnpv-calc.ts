// Deterministic rNPV calculator. The rNPV Agent (rnpv.ts) drafts and cites the
// assumptions; this module does the arithmetic, so every valuation can be
// reproduced from its inputs. tests/rnpv-reference.test.ts checks it against
// independently calculated answers.
//
// Model steps, valued at the start of the valuation year, at asset level and
// before any deal terms (upfront, milestones, royalties to a licensor):
//   1. Development costs are spread over each stage's real duration and
//      weighted by the chance of reaching that stage.
//   2. Patients x list price x (1 - gross-to-net) gives net revenue.
//   3. COGS, SG&A, royalties and tax are subtracted to give cash flow. Tax
//      applies only to profit, and development losses earn no tax credit.
//   4. Commercial cash flow is weighted by overall probability of success.
//   5. Exclusivity ends at lossOfExclusivityYear when known, so development
//      time uses up the patent term. Otherwise exclusivityYears counts from launch.
//   6. Revenue then erodes to 60%/30%/15% of its last level over 3 years.
//   7. Each cash flow is discounted from the end of the period it falls in.
//
// This is a simplified model, not a full financial forecast. Inflation, launch
// costs outside the stated development costs, and working capital are excluded.

import type {
  FinancialAssumptionsOverride,
  ModelAssumptions,
  PlausibilityWarning,
  RnpvComputed,
  SensitivityScenario,
  YearlyCashFlow,
} from "./schemas";

export const RNPV_MODEL_VERSION = 2;

const EROSION_AFTER_EXCLUSIVITY = [0.6, 0.3, 0.15];
const EPSILON = 1e-9;

type ScenarioConfig = {
  scenario: "Conservative" | "Base" | "Aggressive";
  penetrationFactor: number; // 0 = low end of the range, 1 = high end
  priceFactor: number; // 0 = low end of the range, 1 = high end
  costFactor: number; // 0 = low end of the range, 1 = high end
  overallProbabilityMultiplier: number; // applied to overall POS, not to each gate
  discountRateDeltaPercent: number;
  description: string;
};

const SCENARIOS: ScenarioConfig[] = [
  {
    scenario: "Conservative",
    penetrationFactor: 0,
    priceFactor: 0,
    costFactor: 1,
    overallProbabilityMultiplier: 0.8,
    discountRateDeltaPercent: 2,
    description:
      "Low penetration and price, high development costs, overall probability of success cut 20%, discount rate +2 points.",
  },
  {
    scenario: "Base",
    penetrationFactor: 0.5,
    priceFactor: 0.5,
    costFactor: 0.5,
    overallProbabilityMultiplier: 1,
    discountRateDeltaPercent: 0,
    description: "Midpoints of every range, with phase probabilities and discount rate as estimated.",
  },
  {
    scenario: "Aggressive",
    penetrationFactor: 1,
    priceFactor: 1,
    costFactor: 0,
    overallProbabilityMultiplier: 1.15,
    discountRateDeltaPercent: -2,
    description:
      "High penetration and price, low development costs, overall probability of success up to 15% higher, discount rate -2 points.",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(low: number, high: number, factor: number): number {
  return low + (high - low) * factor;
}

function stageKey(stage: string): string {
  return stage.toLowerCase().trim();
}

function gatesMatchTimeline(assumptions: ModelAssumptions): boolean {
  const stages = new Set(assumptions.timeline.map((stage) => stageKey(stage.stage)));
  return assumptions.phaseProbabilities.every((gate) => stages.has(stageKey(gate.fromStage)));
}

// Chance of having reached the start of each timeline stage. A stage with no
// gate carries no attrition. Gates are matched by name; position is only a
// fallback for a user's free-text override, and checkPlausibility flags it.
function stageEntryProbabilities(assumptions: ModelAssumptions, gates: number[]): number[] {
  const byName = gatesMatchTimeline(assumptions);
  const gateByStage = new Map(assumptions.phaseProbabilities.map((gate, i) => [stageKey(gate.fromStage), gates[i]]));
  let running = 1;
  return assumptions.timeline.map((stage, i) => {
    const entry = running;
    running *= (byName ? gateByStage.get(stageKey(stage.stage)) : gates[i]) ?? 1;
    return entry;
  });
}

function commercialYears(assumptions: ModelAssumptions, launchTime: number, valuationYear: number): number {
  if (assumptions.lossOfExclusivityYear !== undefined) {
    return Math.max(0, assumptions.lossOfExclusivityYear - (valuationYear + launchTime));
  }
  return assumptions.exclusivityYears;
}

type ModelResult = {
  yearlyCashFlows: YearlyCashFlow[];
  terminalValueUsd: number;
  totalRnpvUsd: number;
  overallProbabilityOfSuccess: number;
  launchTime: number;
  commercialYears: number;
  peakNetRevenueUsd: number;
  peakPatients: number;
};

function runModel(assumptions: ModelAssumptions, config: ScenarioConfig, valuationYear: number): ModelResult {
  const discountRate = clamp(assumptions.discountRatePercent + config.discountRateDeltaPercent, 0, 100) / 100;
  const presentValue = (amount: number, time: number) => amount / Math.pow(1 + discountRate, time);

  // Each gate takes an equal share of the scenario change, so the overall
  // probability moves by the stated percentage rather than compounding it.
  const gateMultiplier = Math.pow(config.overallProbabilityMultiplier, 1 / assumptions.phaseProbabilities.length);
  const gates = assumptions.phaseProbabilities.map((gate) => clamp(gate.probability * gateMultiplier, 0, 1));
  const entryProbabilities = stageEntryProbabilities(assumptions, gates);
  const overallProbabilityOfSuccess = gates.reduce((product, p) => product * p, 1);

  const costByStage = new Map(
    assumptions.developmentCosts.map((cost) => [stageKey(cost.stage), lerp(cost.lowUsd, cost.highUsd, config.costFactor)])
  );

  const rows: YearlyCashFlow[] = [];
  let totalPv = 0;
  let time = 0;

  assumptions.timeline.forEach((stage, i) => {
    const stageEnd = time + stage.durationYears;
    const totalCost = costByStage.get(stageKey(stage.stage)) ?? 0;
    while (time < stageEnd - EPSILON) {
      const periodEnd = Math.min(Math.floor(time + EPSILON) + 1, stageEnd);
      const gross = -totalCost * ((periodEnd - time) / stage.durationYears);
      const adjusted = gross * entryProbabilities[i];
      const pv = presentValue(adjusted, periodEnd);
      totalPv += pv;
      rows.push({
        year: Math.ceil(periodEnd - EPSILON),
        stage: stage.stage,
        grossCashFlowUsd: Math.round(gross),
        cumulativeProbability: entryProbabilities[i],
        probabilityAdjustedCashFlowUsd: Math.round(adjusted),
        discountedPresentValueUsd: Math.round(pv),
      });
      time = periodEnd;
    }
    time = stageEnd;
  });
  const launchTime = time;

  const { revenueAssumptions: revenue, commercialEconomics: economics } = assumptions;
  const penetration = lerp(revenue.peakPenetrationRateLow, revenue.peakPenetrationRateHigh, config.penetrationFactor);
  const listPrice = lerp(revenue.pricePerPatientUsdLow, revenue.pricePerPatientUsdHigh, config.priceFactor);
  const netPrice = listPrice * (1 - economics.grossToNetPercent / 100);
  const rampYears = Math.max(1, revenue.yearsToPeakSales);

  const patientsInYear = (year: number): number => {
    const ramp = Math.min(year / rampYears, 1);
    if (assumptions.treatmentModel === "chronic") return revenue.treatablePopulationCount * penetration * ramp;
    // A one-time therapy treats each patient once: the existing pool is used
    // up during the ramp, and only newly eligible patients remain after that.
    const fromPool = year <= Math.ceil(rampYears) ? (revenue.treatablePopulationCount * penetration) / Math.ceil(rampYears) : 0;
    return (assumptions.annualNewPatients ?? 0) * penetration * ramp + fromPool;
  };

  const operatingCosts =
    (economics.cogsPercentOfNetRevenue + economics.sgaPercentOfNetRevenue + economics.royaltyPercentOfNetRevenue) / 100;
  const cashFromRevenue = (netRevenue: number): number => {
    const operatingProfit = netRevenue * (1 - operatingCosts);
    return operatingProfit > 0 ? operatingProfit * (1 - economics.taxRatePercent / 100) : operatingProfit;
  };

  const years = commercialYears(assumptions, launchTime, valuationYear);
  let lastAnnualRevenue = 0;
  let peakNetRevenueUsd = 0;
  let peakPatients = 0;

  for (let year = 1; year < years + 1 - EPSILON; year++) {
    const share = Math.min(1, years - (year - 1));
    const patients = patientsInYear(year);
    const annualRevenue = patients * netPrice;
    lastAnnualRevenue = annualRevenue;
    peakNetRevenueUsd = Math.max(peakNetRevenueUsd, annualRevenue);
    peakPatients = Math.max(peakPatients, patients);
    const netRevenue = annualRevenue * share;
    const cash = cashFromRevenue(netRevenue);
    const adjusted = cash * overallProbabilityOfSuccess;
    const periodEnd = launchTime + Math.min(year, years);
    const pv = presentValue(adjusted, periodEnd);
    totalPv += pv;
    rows.push({
      year: Math.ceil(periodEnd - EPSILON),
      stage: year < rampYears ? "Commercial ramp" : "Peak sales (exclusivity)",
      grossCashFlowUsd: Math.round(cash),
      netRevenueUsd: Math.round(netRevenue),
      cumulativeProbability: overallProbabilityOfSuccess,
      probabilityAdjustedCashFlowUsd: Math.round(adjusted),
      discountedPresentValueUsd: Math.round(pv),
    });
  }

  let terminalValue = 0;
  EROSION_AFTER_EXCLUSIVITY.forEach((fraction, i) => {
    const cash = cashFromRevenue(lastAnnualRevenue * fraction);
    terminalValue += presentValue(cash * overallProbabilityOfSuccess, launchTime + years + i + 1);
  });

  return {
    yearlyCashFlows: rows,
    terminalValueUsd: Math.round(terminalValue),
    totalRnpvUsd: Math.round(totalPv + terminalValue),
    overallProbabilityOfSuccess,
    launchTime,
    commercialYears: years,
    peakNetRevenueUsd,
    peakPatients,
  };
}

// Problems that would make the valuation meaningless. The agent gets these
// back to correct before its submission is accepted, instead of the calculator
// guessing (a mismatched stage name used to silently become a $0 cost).
export function validateRnpvAssumptions(assumptions: ModelAssumptions): string[] {
  const problems: string[] = [];
  const stages = assumptions.timeline.map((stage) => stageKey(stage.stage));
  const known = new Set(stages);
  if (known.size !== stages.length) problems.push("timeline has duplicate stage names");

  for (const stage of assumptions.timeline) {
    if (!assumptions.developmentCosts.some((cost) => stageKey(cost.stage) === stageKey(stage.stage))) {
      problems.push(`timeline stage "${stage.stage}" has no developmentCosts entry (use 0 if it truly costs nothing)`);
    }
  }
  for (const cost of assumptions.developmentCosts) {
    if (!known.has(stageKey(cost.stage))) problems.push(`developmentCosts stage "${cost.stage}" is not a timeline stage`);
    if (cost.lowUsd > cost.highUsd) problems.push(`developmentCosts "${cost.stage}" has low above high`);
  }

  const gateStages = assumptions.phaseProbabilities.map((gate) => stageKey(gate.fromStage));
  if (new Set(gateStages).size !== gateStages.length) problems.push("phaseProbabilities has duplicate fromStage values");
  for (const gate of assumptions.phaseProbabilities) {
    if (!known.has(stageKey(gate.fromStage))) {
      problems.push(`phaseProbabilities fromStage "${gate.fromStage}" must exactly match a timeline stage`);
    }
  }
  const positions = gateStages.map((stage) => stages.indexOf(stage)).filter((position) => position >= 0);
  if (positions.some((position, i) => i > 0 && position < positions[i - 1])) {
    problems.push("phaseProbabilities must follow the same order as timeline");
  }

  const { revenueAssumptions: revenue, commercialEconomics: economics } = assumptions;
  if (revenue.peakPenetrationRateLow > revenue.peakPenetrationRateHigh) problems.push("peak penetration low is above high");
  if (revenue.pricePerPatientUsdLow > revenue.pricePerPatientUsdHigh) problems.push("price per patient low is above high");
  if (economics.cogsPercentOfNetRevenue + economics.sgaPercentOfNetRevenue + economics.royaltyPercentOfNetRevenue >= 100) {
    problems.push("COGS, SG&A and royalties together must be below 100% of net revenue");
  }
  return problems;
}

const UNAPPROVED_STAGES = ["Preclinical", "Phase 1", "Phase 2", "Phase 3"];

function checkPlausibility(
  assumptions: ModelAssumptions,
  result: ModelResult,
  stage: string,
  valuationYear: number
): PlausibilityWarning[] {
  const warnings: PlausibilityWarning[] = [];
  const { revenueAssumptions: revenue, discountRatePercent, lossOfExclusivityYear } = assumptions;
  const isUnapproved = UNAPPROVED_STAGES.includes(stage);

  if (!gatesMatchTimeline(assumptions)) {
    warnings.push({
      field: "phaseProbabilities",
      severity: "Flag",
      message: "Some phase probabilities don't match a timeline stage by name, so they were applied in order. Check that each probability lines up with the intended stage.",
    });
  }
  if (revenue.peakPenetrationRateHigh > 0.1) {
    warnings.push({
      field: "peakPenetrationRateHigh",
      severity: "Flag",
      message: `Peak penetration high end of ${(revenue.peakPenetrationRateHigh * 100).toFixed(1)}% is well above the ~1-5% typical for a first-in-class asset. Treat it as an outlier case, not the base case.`,
    });
  }
  if (discountRatePercent > 20) {
    warnings.push({
      field: "discountRatePercent",
      severity: "Note",
      message: `A ${discountRatePercent}% discount rate may count development risk twice, because rNPV already applies it through the phase probabilities. Confirm the rate reflects cost of capital, not clinical risk.`,
    });
  } else if (discountRatePercent < 5) {
    warnings.push({
      field: "discountRatePercent",
      severity: "Note",
      message: `A ${discountRatePercent}% discount rate is close to a risk-free rate and leaves out market and financing risk. Confirm this is intended.`,
    });
  }
  if (isUnapproved && result.overallProbabilityOfSuccess > 0.5) {
    warnings.push({
      field: "overallProbabilityOfSuccess",
      severity: "Flag",
      message: `An overall probability of success of ${(result.overallProbabilityOfSuccess * 100).toFixed(1)}% is unusually high for an unapproved asset. Check each phase probability.`,
    });
  }
  if (result.commercialYears <= 0) {
    warnings.push({
      field: "lossOfExclusivityYear",
      severity: "Flag",
      message: `Exclusivity ends in ${lossOfExclusivityYear}, before the modeled launch in ${valuationYear + Math.ceil(result.launchTime)}, so this model has no protected sales. Check the patent position or timeline.`,
    });
  } else if (result.commercialYears < revenue.yearsToPeakSales) {
    warnings.push({
      field: "commercialYears",
      severity: "Note",
      message: `Only ${result.commercialYears.toFixed(1)} protected years remain after launch, fewer than the ${revenue.yearsToPeakSales} years needed to reach peak sales.`,
    });
  } else if (result.commercialYears > 20) {
    warnings.push({
      field: "commercialYears",
      severity: "Note",
      message: `${result.commercialYears.toFixed(1)} protected years after launch exceeds a standard 20-year patent term. Check the exclusivity assumption.`,
    });
  }
  return warnings;
}

// Merges a user's numbers over the AI-drafted assumptions. A user's exclusivity
// figure replaces the AI's expiry year, or that year would still take priority.
export function applyFinancialAssumptionsOverride(
  assumptions: ModelAssumptions,
  override: FinancialAssumptionsOverride
): ModelAssumptions {
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
      override.discountRatePercent !== undefined ? "User-provided discount rate." : assumptions.discountRateRationale,
    exclusivityYears: override.exclusivityYears ?? assumptions.exclusivityYears,
    lossOfExclusivityYear: override.exclusivityYears !== undefined ? undefined : assumptions.lossOfExclusivityYear,
    exclusivityYearsRationale:
      override.exclusivityYears !== undefined ? "User-provided exclusivity estimate." : assumptions.exclusivityYearsRationale,
  };
}

export function computeRnpv(
  assumptions: ModelAssumptions,
  stage: string,
  valuationDate: Date = new Date()
): RnpvComputed {
  const valuationYear = valuationDate.getUTCFullYear();
  const baseConfig = SCENARIOS.find((scenario) => scenario.scenario === "Base");
  if (!baseConfig) throw new Error("rnpv-calc: Base scenario config missing");
  const base = runModel(assumptions, baseConfig, valuationYear);

  const sensitivityScenarios: SensitivityScenario[] = SCENARIOS.map((config) => ({
    scenario: config.scenario,
    keyAssumptionChanges: config.description,
    rnpvUsd: config.scenario === "Base" ? base.totalRnpvUsd : runModel(assumptions, config, valuationYear).totalRnpvUsd,
  }));

  return {
    modelVersion: RNPV_MODEL_VERSION,
    valuationYear,
    launchYear: valuationYear + Math.ceil(base.launchTime - EPSILON),
    commercialYearsBeforeLossOfExclusivity: base.commercialYears,
    peakNetRevenueUsd: Math.round(base.peakNetRevenueUsd),
    peakPatientsTreated: Math.round(base.peakPatients),
    yearlyCashFlows: base.yearlyCashFlows,
    terminalValueUsd: base.terminalValueUsd,
    totalRnpvUsd: base.totalRnpvUsd,
    overallProbabilityOfSuccess: base.overallProbabilityOfSuccess,
    sensitivityScenarios,
    plausibilityWarnings: checkPlausibility(assumptions, base, stage, valuationYear),
  };
}
