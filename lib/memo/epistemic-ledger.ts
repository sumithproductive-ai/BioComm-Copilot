// Memo-wide Fact/Inference/Assumption/Unknown counts — the "Epistemic
// Ledger" concept from the design reference. Pure aggregation over data
// every section already persists (every claim already carries a
// ClaimLabel) — no new agent capability, just a second view of it.

import type { ClaimLabel } from "@/lib/agents/schemas";
import type {
  ClinicalLandscape,
  CompetitiveLandscape,
  CommercialOpportunity,
  RegulatoryLandscape,
  KeyRisksAndRecommendations,
} from "@/lib/agents/persist";

export const EPISTEMIC_LABELS: ClaimLabel[] = ["Fact", "Inference", "Assumption", "Unknown"];

export type EpistemicLedger = {
  counts: Record<ClaimLabel, number>;
  sampleClaims: { label: ClaimLabel; text: string }[];
};

export type EpistemicLedgerInput = {
  clinical: ClinicalLandscape | null;
  competitive: CompetitiveLandscape | null;
  commercial: CommercialOpportunity | null;
  regulatory: RegulatoryLandscape | null;
  keyRisksAndRecommendations: KeyRisksAndRecommendations | null;
};

const MAX_SAMPLES_PER_LABEL = 2;

export function computeEpistemicLedger(input: EpistemicLedgerInput): EpistemicLedger {
  const counts: Record<ClaimLabel, number> = { Fact: 0, Assumption: 0, Inference: 0, Unknown: 0 };
  const sampleCountByLabel: Record<ClaimLabel, number> = { Fact: 0, Assumption: 0, Inference: 0, Unknown: 0 };
  const sampleClaims: { label: ClaimLabel; text: string }[] = [];

  function tag(label: ClaimLabel | null | undefined, text: string | null | undefined) {
    if (!label || !text) return;
    counts[label]++;
    if (sampleCountByLabel[label] < MAX_SAMPLES_PER_LABEL) {
      sampleCountByLabel[label]++;
      sampleClaims.push({ label, text });
    }
  }

  const { clinical, competitive, commercial, regulatory, keyRisksAndRecommendations } = input;

  if (clinical) {
    tag(clinical.mechanismLabel, clinical.mechanismSummary);
    for (const signal of clinical.safetySignals) tag(signal.label, signal.description);
    for (const failure of clinical.similarDrugFailures) tag(failure.label, failure.reasonForFailure);
  }
  if (competitive) {
    for (const gap of competitive.positioningGaps) tag(gap.label, gap.description);
  }
  if (commercial) {
    tag(commercial.patientPopulationLabel, commercial.patientPopulationValue);
    tag(commercial.differentiationLabel, commercial.differentiationSummary);
  }
  if (regulatory) {
    tag(regulatory.developmentTimelineLabel, regulatory.developmentTimelineSummary);
  }
  if (keyRisksAndRecommendations) {
    for (const risk of keyRisksAndRecommendations.keyRisks) tag(risk.label, risk.description);
    for (const rec of keyRisksAndRecommendations.routeRecommendations) tag(rec.label, rec.description);
  }

  return { counts, sampleClaims };
}
