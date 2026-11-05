// Runs the real pipeline over the benchmark assets and saves raw results to
// evals/results/ (not committed). Real runs cost about $8 each, so they need
// --confirm-spend. Set MOCK_AGENTS_FOR_LOCAL_TEST=true for a free plumbing test.
//   npm run eval -- --assets uc-il23-canary --repeats 1 --confirm-spend
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runOrchestrator } from "../lib/agents/orchestrator";
import { isMockAgentsEnabled } from "../lib/agents/mock-mode";

const COST_PER_RUN_USD = 8;

async function main() {
  const { values } = parseArgs({
    options: {
      assets: { type: "string", default: "all" },
      repeats: { type: "string", default: "1" },
      "confirm-spend": { type: "boolean", default: false },
    },
  });
  const { assets } = JSON.parse(readFileSync("evals/assets.json", "utf8"));
  const wanted = values.assets === "all" ? null : values.assets!.split(",");
  const selected = assets.filter((asset: { id: string }) => !wanted || wanted.includes(asset.id));
  if (wanted && selected.length !== wanted.length) throw new Error("Unknown asset id in --assets");
  const repeats = Number(values.repeats);
  const runs = selected.length * repeats;
  const mock = isMockAgentsEnabled();
  console.log(`${runs} run(s)${mock ? " in mock mode, $0" : `, about $${runs * COST_PER_RUN_USD} in API cost`}`);
  if (!mock && !values["confirm-spend"]) throw new Error("Real runs cost money: pass --confirm-spend");

  mkdirSync("evals/results", { recursive: true });
  for (const asset of selected) {
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const started = Date.now();
      console.log(`Running ${asset.id} #${repeat}`);
      const manifest = await runOrchestrator(asset.input);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `evals/results/${asset.id}__${repeat}__${stamp}.json`;
      writeFileSync(path, JSON.stringify({ asset, repeat, mock, manifest }, null, 2));
      console.log(`  done in ${Math.round((Date.now() - started) / 1000)}s: ${path}`);
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
