import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyStatus, collectStrings, competitorRecall, gate, stability, zeroFailureUpperBound } from "../evals/score-lib";

test("collects nested values", () => {
  assert.deepEqual(collectStrings({ a: [{ sourceUrl: "x" }], b: { sourceUrl: "y" } }, "sourceUrl"), ["x", "y"]);
});
test("competitor recall tolerates brand names in the reported string", () => {
  const { recall, missing } = competitorRecall(["Vedolizumab (Entyvio)"], ["Vedolizumab", "Tofacitinib"]);
  assert.equal(recall, 0.5);
  assert.deepEqual(missing, ["Tofacitinib"]);
});
test("missing data is NOT MEASURED, never a pass", () => {
  assert.equal(gate(null, 0.9), "NOT MEASURED");
  assert.equal(gate(0.89, 0.9), "FAIL");
  assert.equal(gate(0.9, 0.9), "PASS");
});
test("a site blocking scripts is not treated as a dead link", () => {
  assert.equal(classifyStatus(403), "blocked");
  assert.equal(classifyStatus(404), "dead");
  assert.equal(classifyStatus(200), "ok");
});
test("stability and the rule of three", () => {
  assert.equal(stability(["a", "a", "b", "a"]), 0.75);
  assert.equal(zeroFailureUpperBound(300), 0.01);
  assert.equal(zeroFailureUpperBound(0), null);
});
