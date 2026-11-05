// Expected totals were calculated separately, year by year, without using
// rnpv-calc.ts. If one fails, work out which side is wrong; don't just paste
// the new number in.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyFinancialAssumptionsOverride,
  checkPopulationConsistency,
  computeInputSourcing,
  computeRnpv,
  parsePatientCounts,
  validateRnpvAssumptions,
} from "../lib/agents/rnpv-calc";
import { modelAssumptionsSchema, rnpvOutputSchema, type ModelAssumptions } from "../lib/agents/schemas";

const VALUATION = new Date("2026-06-30T00:00:00Z");
const label = "Assumption" as const;
const stage = (name: string, durationYears: number) => ({ stage: name, durationYears, label });
const cost = (name: string, usd: number) => ({ stage: name, lowUsd: usd, highUsd: usd, label });
const gate = (from: string, to: string, probability: number) => ({ fromStage: from, toStage: to, probability, label, rationale: "test" });
const economics = (g2n = 0, cogs = 0, sga = 0, royalty = 0, tax = 0) => ({
  grossToNetPercent: g2n, cogsPercentOfNetRevenue: cogs, sgaPercentOfNetRevenue: sga,
  royaltyPercentOfNetRevenue: royalty, taxRatePercent: tax, rationale: "test", label,
});
const revenue = (population: number, penLow: number, penHigh: number, priceLow: number, priceHigh: number, ramp: number) => ({
  treatablePopulationCount: population, treatablePopulationDescription: "test", treatablePopulationLabel: label,
  peakPenetrationRateLow: penLow, peakPenetrationRateHigh: penHigh, pricePerPatientUsdLow: priceLow,
  pricePerPatientUsdHigh: priceHigh, yearsToPeakSales: ramp, label,
});

const caseA = (over: Partial<ModelAssumptions> = {}): ModelAssumptions => ({
  phaseProbabilities: [gate("Phase 3", "Approval", 0.5)],
  developmentCosts: [cost("Phase 3", 100_000)],
  timeline: [stage("Phase 3", 1)],
  revenueAssumptions: revenue(1000, 0.1, 0.1, 1000, 1000, 1),
  discountRatePercent: 10,
  discountRateRationale: "test",
  exclusivityYears: 1,
  treatmentModel: "chronic",
  populationReconciliation: { startingPopulationCount: 1000, explanation: "test" },
  commercialEconomics: economics(),
  ...over,
});

const caseC = (over: Partial<ModelAssumptions> = {}): ModelAssumptions => ({
  phaseProbabilities: [gate("Phase 2", "Phase 3", 0.3), gate("Phase 3", "Filing", 0.6), gate("Filing", "Approval", 0.9)],
  developmentCosts: [cost("Phase 2", 20e6), cost("Phase 3", 100e6), cost("Filing", 5e6)],
  timeline: [stage("Phase 2", 2), stage("Phase 3", 3), stage("Filing", 1)],
  revenueAssumptions: revenue(200_000, 0.02, 0.04, 40_000, 60_000, 4),
  discountRatePercent: 11,
  discountRateRationale: "test",
  exclusivityYears: 99, // must be ignored, because lossOfExclusivityYear is set
  lossOfExclusivityYear: 2041,
  treatmentModel: "chronic",
  populationReconciliation: { startingPopulationCount: 1_000_000, explanation: "test" },
  commercialEconomics: economics(25, 15, 30, 5, 21),
  ...over,
});

const total = (a: ModelAssumptions) => computeRnpv(a, "Phase 2", VALUATION).totalRnpvUsd;

test("A: minimal model with no operating costs", () => {
  assert.equal(total(caseA()), Math.round(-12145.22));
});

test("B: gross-to-net, operating costs and tax reduce cash flow", () => {
  assert.equal(total(caseA({ commercialEconomics: economics(20, 10, 30, 5, 20) })), Math.round(-63184.21));
});

test("C: full chronic model with exclusivity from a patent date", () => {
  const result = computeRnpv(caseC(), "Phase 2", VALUATION);
  assert.equal(result.totalRnpvUsd, Math.round(-1860687.63));
  assert.equal(result.terminalValueUsd, 2689333);
  assert.equal(result.peakNetRevenueUsd, 225_000_000);
  assert.equal(result.commercialYearsBeforeLossOfExclusivity, 9);
  assert.equal(result.launchYear, 2032);
  assert.ok(Math.abs(result.overallProbabilityOfSuccess - 0.162) < 1e-12);
});

test("D: one-time therapy uses up its existing patient pool", () => {
  const assumptions: ModelAssumptions = {
    phaseProbabilities: [gate("Phase 3", "Filing", 0.5), gate("Filing", "Approval", 0.8)],
    developmentCosts: [cost("Phase 3", 30e6), cost("Filing", 2e6)],
    timeline: [stage("Phase 3", 1.5), stage("Filing", 0.5)],
    revenueAssumptions: revenue(100_000, 0.1, 0.1, 500_000, 500_000, 2),
    discountRatePercent: 12,
    discountRateRationale: "test",
    exclusivityYears: 5,
    treatmentModel: "oneTime",
    populationReconciliation: { startingPopulationCount: 100_000, explanation: "test" },
    annualNewPatients: 5000,
    commercialEconomics: economics(10, 20, 25, 0, 20),
  };
  const result = computeRnpv(assumptions, "Phase 3", VALUATION);
  assert.equal(result.totalRnpvUsd, Math.round(621937416.7));
  assert.equal(result.terminalValueUsd, 15792834);
  assert.equal(result.peakPatientsTreated, 5500);
});

test("E: exclusivity ending before launch leaves no commercial value and is flagged", () => {
  const assumptions = caseA({
    phaseProbabilities: [gate("Phase 3", "Approval", 0.5)],
    developmentCosts: [cost("Phase 3", 10e6)],
    timeline: [stage("Phase 3", 3)],
    lossOfExclusivityYear: 2028,
  });
  const result = computeRnpv(assumptions, "Phase 3", VALUATION);
  assert.equal(result.totalRnpvUsd, Math.round(-8289506.64));
  assert.ok(result.plausibilityWarnings.some((w) => w.field === "lossOfExclusivityYear" && w.severity === "Flag"));
});

test("F: fractional stage lengths and a part-year of exclusivity are not rounded", () => {
  const result = computeRnpv(caseC({ timeline: [stage("Phase 2", 2), stage("Phase 3", 3), stage("Filing", 1.5)] }), "Phase 2", VALUATION);
  assert.equal(result.totalRnpvUsd, Math.round(-4876335.69));
  assert.equal(result.commercialYearsBeforeLossOfExclusivity, 8.5);
});

test("tax never creates a credit on an operating loss", () => {
  const lossMaking = economics(0, 60, 60, 0, 50);
  const withTax = total(caseA({ commercialEconomics: lossMaking }));
  const withoutTax = total(caseA({ commercialEconomics: { ...lossMaking, taxRatePercent: 0 } }));
  assert.equal(withTax, withoutTax);
});

test("revenue is no longer counted as cash flow", () => {
  assert.ok(total(caseC()) < total(caseC({ commercialEconomics: economics() })));
});

test("conservative scenario cuts overall probability by exactly 20%", () => {
  const scenario = computeRnpv(caseC(), "Phase 2", VALUATION).sensitivityScenarios.find((s) => s.scenario === "Conservative")!;
  assert.equal(scenario.rnpvUsd, Math.round(-21848388.43));
});

test("scenarios are ordered conservative, base, aggressive by value", () => {
  const [low, base, high] = computeRnpv(caseC(), "Phase 2", VALUATION).sensitivityScenarios;
  assert.ok(low.rnpvUsd < base.rnpvUsd && base.rnpvUsd < high.rnpvUsd);
});

test("validation rejects mismatched stages instead of costing them at $0", () => {
  assert.deepEqual(validateRnpvAssumptions(caseC()), []);
  const problems = validateRnpvAssumptions(caseC({
    developmentCosts: [cost("Phase II", 20e6), cost("Phase 3", 100e6), cost("Filing", 5e6)],
    phaseProbabilities: [gate("Phase 3", "Filing", 0.6), gate("Phase 2", "Phase 3", 0.3), gate("NDA", "Approval", 0.9)],
  }));
  assert.ok(problems.some((p) => p.includes('"Phase 2" has no developmentCosts')));
  assert.ok(problems.some((p) => p.includes('"Phase II" is not a timeline stage')));
  assert.ok(problems.some((p) => p.includes('"NDA"')));
  assert.ok(problems.some((p) => p.includes("same order")));
});

test("validation rejects inverted ranges and impossible margins", () => {
  const problems = validateRnpvAssumptions(caseC({
    revenueAssumptions: revenue(1, 0.5, 0.1, 9, 1, 1),
    commercialEconomics: economics(0, 60, 40),
  }));
  assert.equal(problems.length, 3);
});

test("user override with unmatched stage names is applied in order and flagged", () => {
  const merged = applyFinancialAssumptionsOverride(caseC(), {
    phaseProbabilities: [{ fromStage: "P2", toStage: "P3", probability: 0.5 }],
  });
  const result = computeRnpv(merged, "Phase 2", VALUATION);
  assert.equal(result.overallProbabilityOfSuccess, 0.5);
  assert.ok(result.plausibilityWarnings.some((w) => w.field === "phaseProbabilities" && w.severity === "Flag"));
});

test("user exclusivity override replaces the AI's expiry year", () => {
  const merged = applyFinancialAssumptionsOverride(caseC(), { exclusivityYears: 5 });
  assert.equal(computeRnpv(merged, "Phase 2", VALUATION).commercialYearsBeforeLossOfExclusivity, 5);
});

test("discount warnings point at double counting, not a required 15-25% range", () => {
  const warnings = (rate: number) => computeRnpv(caseC({ discountRatePercent: rate }), "Phase 2", VALUATION).plausibilityWarnings.filter((w) => w.field === "discountRatePercent");
  assert.equal(warnings(11).length, 0);
  assert.ok(warnings(25)[0].message.includes("twice"));
  assert.equal(warnings(3)[0].severity, "Note");
});

test("coverage counts each input and names the unsourced ones", () => {
  const citation = { sourceType: "Other" as const, sourceUrl: "https://a.com/x", accessedDate: "2026-11-01" };
  const uncited = computeInputSourcing(caseC());
  assert.deepEqual([uncited.sourced, uncited.total], [0, 13]);
  assert.ok(uncited.unsourcedInputs.includes("Discount rate"));
  assert.ok(uncited.unsourcedInputs.includes("Probability: Phase 2 to Phase 3"));
  const cited = computeInputSourcing(caseC({ discountRateCitation: citation }));
  assert.equal(cited.sourced, 1);
  assert.ok(!cited.unsourcedInputs.includes("Discount rate"));
});

test("mostly unsourced valuations are flagged, and well-sourced ones are not", () => {
  const citation = { sourceType: "Other" as const, sourceUrl: "https://a.com/x", accessedDate: "2026-11-01" };
  const has = (a: ModelAssumptions) => computeRnpv(a, "Phase 2", VALUATION).plausibilityWarnings.some((w) => w.field === "inputSourcing");
  assert.equal(has(caseC()), true);
  const base = caseC();
  const sourced = caseC({
    phaseProbabilities: base.phaseProbabilities.map((g) => ({ ...g, citation })),
    developmentCosts: base.developmentCosts.map((c) => ({ ...c, citation })),
    timeline: base.timeline.map((t) => ({ ...t, citation })),
  });
  assert.equal(has(sourced), false);
});

test("reads patient counts from free text, ignoring years and percentages", () => {
  assert.deepEqual(parsePatientCounts("roughly 1 million US patients in 2024, about 30% severe"), [1_000_000]);
  assert.deepEqual(parsePatientCounts("700,000 to 1.2M adults"), [700_000, 1_200_000]);
  assert.deepEqual(parsePatientCounts("150 thousand"), [150_000]);
  assert.deepEqual(parsePatientCounts("no figure available"), []);
});

test("population check flags an unexplained change of starting figure", () => {
  const flagged = (start: number, estimate?: string) =>
    checkPopulationConsistency(caseC({ populationReconciliation: { startingPopulationCount: start, explanation: "reason" } }), estimate)
      .filter((w) => w.field === "populationReconciliation");
  assert.equal(flagged(1_500_000, "roughly 1 million US patients").length, 1);
  assert.ok(flagged(1_500_000, "roughly 1 million US patients")[0].message.includes("reason"));
  assert.equal(flagged(1_050_000, "roughly 1 million US patients").length, 0);
  assert.equal(flagged(1_500_000, "figure not available").length, 0);
  assert.equal(flagged(1_500_000, undefined).length, 0);
});

test("a treatable population larger than its starting point is flagged", () => {
  const warnings = checkPopulationConsistency(caseC({ populationReconciliation: { startingPopulationCount: 1000, explanation: "x" } }), undefined);
  assert.ok(warnings.some((w) => w.field === "treatablePopulationCount" && w.severity === "Flag"));
});

test("penetration above 5% gets a note, and above 10% a flag", () => {
  const severity = (high: number) =>
    computeRnpv(caseC({ revenueAssumptions: revenue(200_000, 0.02, high, 40_000, 60_000, 4) }), "Phase 2", VALUATION)
      .plausibilityWarnings.find((w) => w.field === "peakPenetrationRateHigh")?.severity;
  assert.equal(severity(0.05), undefined);
  assert.equal(severity(0.1), "Note");
  assert.equal(severity(0.11), "Flag");
});

test("new submissions must include economics and a treatment model", () => {
  const { commercialEconomics: _economics, treatmentModel: _treatment, ...old } = caseC();
  assert.equal(modelAssumptionsSchema.safeParse(old).success, false);
});

test("memos saved under the earlier model still open", () => {
  const { commercialEconomics: _economics, treatmentModel: _treatment, lossOfExclusivityYear: _loe, populationReconciliation: _population, ...old } = caseC();
  const parsed = rnpvOutputSchema.safeParse({
    assumptions: old,
    computed: {
      yearlyCashFlows: [{ year: 1, stage: "Phase 2", grossCashFlowUsd: -1, cumulativeProbability: 1, probabilityAdjustedCashFlowUsd: -1, discountedPresentValueUsd: -1 }],
      terminalValueUsd: 0, totalRnpvUsd: -1, overallProbabilityOfSuccess: 0.1,
      sensitivityScenarios: ["Conservative", "Base", "Aggressive"].map((scenario) => ({ scenario, keyAssumptionChanges: "x", rnpvUsd: 0 })),
      plausibilityWarnings: [],
    },
    benchmarkingNotes: { summary: "x", label },
    methodologyNote: "x",
    providedOverride: null,
    providedComputed: null,
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.computed.modelVersion, undefined);
});
