// StaleData is plain date arithmetic, so it runs in code. A planted stale
// trial was missed by the model-based check in every test run (PR #21).
import type { CriticOutput, ResearchOutputs } from "./schemas";

type CriticFlag = CriticOutput["flags"][number];

export function findStaleTrialFlags(
  clinical: ResearchOutputs["clinical"],
  existingFlags: CriticFlag[],
  today: Date = new Date()
): CriticFlag[] {
  if (!clinical) return [];
  const cutoff = new Date(today);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const alreadyFlagged = existingFlags.filter((flag) => flag.type === "StaleData");
  return clinical.trials
    .filter((trial) => !trial.isStale && new Date(trial.statusAsOfDate) < cutoff)
    .filter((trial) => !alreadyFlagged.some((flag) => flag.description.includes(trial.nctId)))
    .map((trial) => ({
      type: "StaleData" as const,
      section: "Clinical Research",
      description: `Trial ${trial.nctId} has statusAsOfDate of ${trial.statusAsOfDate} (more than 12 months old) but isStale is false.`,
    }));
}
