import assert from "node:assert/strict";
import { test } from "node:test";
process.env.ANTHROPIC_API_KEY ||= "test-key-not-used";
// Loaded lazily so the placeholder key is set before the Anthropic client is created.
const compute = async (...args: unknown[]) => {
  const { computeDecisionSummary } = await import("../lib/agents/synthesis");
  return (computeDecisionSummary as (...a: unknown[]) => ReturnType<typeof computeDecisionSummary>)(...args);
};

const citation = { sourceType: "Other", sourceUrl: "https://a.com/x", accessedDate: "2026-11-01" };
const commercial = (over: object = {}) => ({
  patientPopulationEstimate: { value: "1", label: "Fact", citation },
  unmetNeed: { summary: "", citations: [citation] },
  marketCrowdingAssessment: { summary: "", consistentWithCompetitiveLandscape: true },
  differentiationPotential: { summary: "", label: "Inference" },
  ...over,
});
const outputs = (over: object = {}) =>
  ({ clinical: null, competitive: null, commercial: null, regulatory: null, dealComparables: null, patents: null, rnpv: null, ...over }) as never;
const staleTrial = { trials: [{ isStale: true }] };

test("thin evidence with trials present is never Do Not Pursue", async () => {
  const summary = await compute(outputs({ clinical: staleTrial }), null, 0, "Ulcerative colitis");
  assert.ok(summary.confidenceScore < 4);
  assert.equal(summary.recommendedNextStep, "GatherMoreData");
});
test("no trials still means gather more data", async () => {
  const summary = await compute(outputs(), null, 0, "Ulcerative colitis");
  assert.equal(summary.recommendedNextStep, "GatherMoreData");
});
test("High requires cited unmet need and reasoned differentiation", async () => {
  const rate = async (c: object) => (await compute(outputs({ commercial: c }), null, 0, "Asthma")).commercialOpportunity;
  assert.equal(await rate(commercial()), "High");
  assert.equal(await rate(commercial({ unmetNeed: { summary: "", citations: [] } })), "Medium");
  assert.equal(await rate(commercial({ differentiationPotential: { summary: "", label: "Assumption" } })), "Medium");
  assert.equal(await rate(commercial({ marketCrowdingAssessment: { summary: "", consistentWithCompetitiveLandscape: false } })), "Medium");
  assert.equal(await rate(commercial({ patientPopulationEstimate: { value: "1", label: "Assumption" } })), "Low");
});
