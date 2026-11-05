import assert from "node:assert/strict";
import { test } from "node:test";
import { findStaleTrialFlags } from "../lib/agents/stale-check";

const today = new Date("2026-11-05T00:00:00Z");
const clinical = (statusAsOfDate: string, isStale = false) =>
  ({ trials: [{ nctId: "NCT01234567", statusAsOfDate, isStale }] }) as never;

test("flags an unmarked trial older than 12 months", () => {
  assert.equal(findStaleTrialFlags(clinical("2025-10-01"), [], today).length, 1);
});
test("ignores recent trials and trials already marked stale", () => {
  assert.equal(findStaleTrialFlags(clinical("2026-01-01"), [], today).length, 0);
  assert.equal(findStaleTrialFlags(clinical("2020-01-01", true), [], today).length, 0);
});
test("doesn't duplicate a flag the model already raised, and handles a failed agent", () => {
  const existing = [{ type: "StaleData", section: "Clinical Research", description: "NCT01234567 is old" }] as never;
  assert.equal(findStaleTrialFlags(clinical("2020-01-01"), existing, today).length, 0);
  assert.equal(findStaleTrialFlags(null, [], today).length, 0);
});
