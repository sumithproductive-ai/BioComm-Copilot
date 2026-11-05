// Scores saved runs and writes evals/results/review-sample.csv for the human
// claim-support check. Run with --no-network to skip live URL and NCT checks.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { UC_COMPETITOR_REFERENCE_LIST } from "../lib/config/uc-competitors";
import { classifyStatus, collectStrings, competitorRecall, csvCell, gate, stability, zeroFailureUpperBound, type UrlCheck } from "./score-lib";

const DIR = "evals/results";
const offline = process.argv.includes("--no-network");

async function checkUrl(url: string): Promise<UrlCheck> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "BioCommCopilot-eval" } });
    return classifyStatus(res.status);
  } catch {
    return "error";
  }
}

async function nctExists(nctId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://clinicaltrials.gov/api/v2/studies/${nctId}?fields=NCTId`, { signal: AbortSignal.timeout(15000) });
    if (res.status === 404) return false;
    return res.ok ? true : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(DIR)) throw new Error("No results yet: run npm run eval first");
  const runs = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")));
  if (runs.length === 0) throw new Error("No results yet: run npm run eval first");
  if (runs.some((r) => r.mock)) console.log("WARNING: includes mock runs. These scores test the plumbing, not accuracy.\n");
  const unscorable = runs.filter((r) => !r.manifest.synthesisOutput);
  if (unscorable.length > 0) console.log(`WARNING: ${unscorable.length} run(s) produced no memo, so their scores mean nothing. Check manifest.agentNotes.\n`);

  const urls = [...new Set<string>(runs.flatMap((r) => collectStrings(r.manifest.researchOutputs, "sourceUrl")))];
  const ncts = [...new Set<string>(runs.flatMap((r) => collectStrings(r.manifest.researchOutputs?.clinical, "nctId")))];

  const recalls: number[] = [];
  for (const run of runs) {
    const expected = run.asset.category === "uc" ? UC_COMPETITOR_REFERENCE_LIST.map((c) => c.drug) : run.asset.approvedCompetitors;
    if (!expected) continue;
    const reported = (run.manifest.researchOutputs.competitive?.approvedCompetitors ?? []).map((c: { drug: string }) => c.drug);
    const { recall, missing } = competitorRecall(reported, expected);
    recalls.push(recall);
    if (missing.length > 0) console.log(`${run.asset.id} #${run.repeat} missing: ${missing.join(", ")}`);
  }

  const traps = runs.filter((r) => r.asset.expect?.noTrials);
  const trapsPassed = traps.filter((r) => (r.manifest.researchOutputs.clinical?.trials.length ?? 0) === 0 && r.manifest.synthesisOutput?.decisionSummary?.recommendedNextStep === "GatherMoreData");

  const byAsset = new Map<string, string[]>();
  for (const run of runs) {
    const step = run.manifest.synthesisOutput?.decisionSummary?.recommendedNextStep ?? "none";
    byAsset.set(run.asset.id, [...(byAsset.get(run.asset.id) ?? []), step]);
  }
  const repeated = [...byAsset.values()].filter((steps) => steps.length > 1);

  let fakeNcts: number | null = null;
  const urlCounts: Record<UrlCheck, number> = { ok: 0, blocked: 0, dead: 0, error: 0 };
  if (!offline) {
    fakeNcts = 0;
    for (const nct of ncts) {
      if ((await nctExists(nct)) === false) {
        fakeNcts++;
        console.log(`NCT ID NOT FOUND: ${nct}`);
      }
    }
    for (const url of urls) {
      const result = await checkUrl(url);
      urlCounts[result]++;
      if (result === "dead") console.log(`DEAD URL: ${url}`);
    }
  }

  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const rows: [string, string, string][] = [
    ["NCT IDs not in ClinicalTrials.gov", fakeNcts === null ? "skipped" : `${fakeNcts} of ${ncts.length}`, fakeNcts === null || ncts.length === 0 ? "NOT MEASURED" : fakeNcts === 0 ? "PASS" : "FAIL"],
    ["Citation URLs dead", offline ? "skipped" : `${urlCounts.dead} of ${urls.length} (${urlCounts.blocked} blocked, ${urlCounts.error} errors: check by hand)`, offline || urls.length === 0 ? "NOT MEASURED" : urlCounts.dead === 0 ? "PASS" : "FAIL"],
    ["Citations support the claim (pass 95%)", "fill in review-sample.csv", "NOT MEASURED"],
    ["Approved competitor recall (pass 95%)", recalls.length ? `${(average(recalls)! * 100).toFixed(0)}% over ${recalls.length} runs` : "no answer key", gate(average(recalls), 0.95)],
    ["Late-stage pipeline recall (pass 80%)", "needs expert key", "NOT MEASURED"],
    ["No-data traps handled (pass 100%)", traps.length ? `${trapsPassed.length} of ${traps.length}` : "none run", gate(traps.length ? trapsPassed.length / traps.length : null, 1)],
    ["Same recommendation across repeats (pass 90%)", repeated.length ? `${(average(repeated.map(stability))! * 100).toFixed(0)}%` : "needs --repeats 2+", gate(average(repeated.map(stability)), 0.9)],
    ["Expert agrees with recommendation", "needs blind expert review", "NOT MEASURED"],
  ];
  console.log(`\n${runs.length} run(s), ${urls.length} unique citations`);
  for (const [name, value, status] of rows) console.log(`[${status}] ${name}: ${value}`);
  const bound = zeroFailureUpperBound(urls.length);
  if (bound !== null && urls.length >= 30) console.log(`With zero failures, ${urls.length} citations supports a bad-citation rate under ${(bound * 100).toFixed(1)}% (95% confidence).`);

  const lines = ["asset,repeat,section,source_url,claim_supported_yes_no,reviewer_notes"];
  for (const run of runs) {
    for (const [section, output] of Object.entries(run.manifest.researchOutputs)) {
      for (const url of collectStrings(output, "sourceUrl")) lines.push([run.asset.id, String(run.repeat), section, url, "", ""].map(csvCell).join(","));
    }
  }
  writeFileSync(`${DIR}/review-sample.csv`, `${lines.join("\n")}\n`);
  console.log(`\nHuman review sheet: ${DIR}/review-sample.csv (${lines.length - 1} citations)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
