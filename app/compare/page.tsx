import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  getDecisionSummary,
  getClinicalLandscape,
  getCompetitiveLandscape,
  getCommercialOpportunity,
  getRegulatoryLandscape,
  getKeyRisksAndRecommendations,
} from "@/lib/agents/persist";
import { computeEpistemicLedger } from "@/lib/memo/epistemic-ledger";
import { isValidUuid } from "@/lib/memo/is-valid-uuid";
import { CompareView, type ComparisonSide } from "@/components/compare-view";

async function loadComparisonSide(id: string): Promise<ComparisonSide | null> {
  const memoRun = await db.memoRun.findUnique({
    where: { id },
    select: { id: true, target: true, modality: true, stage: true, indication: true, createdAt: true },
  });
  if (!memoRun) return null;

  const [decisionSummary, clinical, competitive, commercial, regulatory, keyRisksAndRecommendations] =
    await Promise.all([
      getDecisionSummary(id),
      getClinicalLandscape(id),
      getCompetitiveLandscape(id),
      getCommercialOpportunity(id),
      getRegulatoryLandscape(id),
      getKeyRisksAndRecommendations(id),
    ]);

  const epistemicLedger = computeEpistemicLedger({
    clinical,
    competitive,
    commercial,
    regulatory,
    keyRisksAndRecommendations,
  });

  return {
    memoRun: { ...memoRun, createdAt: memoRun.createdAt.toISOString() },
    decisionSummary: decisionSummary?.decisionSummary
      ? {
          commercialOpportunity: decisionSummary.decisionSummary.commercialOpportunity,
          confidenceScore: Number(decisionSummary.decisionSummary.confidenceScore),
          recommendedNextStep: decisionSummary.decisionSummary.recommendedNextStep,
          keyRisksCount: decisionSummary.decisionSummary.keyRisksCount,
          comparableDealsFoundCount: decisionSummary.decisionSummary.comparableDealsFoundCount,
        }
      : null,
    epistemicLedger,
  };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const a = typeof params.a === "string" ? params.a : undefined;
  const b = typeof params.b === "string" ? params.b : undefined;

  if (!a || !b || !isValidUuid(a) || !isValidUuid(b)) notFound();

  const [sideA, sideB] = await Promise.all([loadComparisonSide(a), loadComparisonSide(b)]);
  if (!sideA || !sideB) notFound();

  // Order by recency rather than by which checkbox was clicked first, so
  // "what changed" reads as older → newer, not an arbitrary click order.
  const [older, newer] =
    sideA.memoRun.createdAt <= sideB.memoRun.createdAt ? [sideA, sideB] : [sideB, sideA];

  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div className="w-full max-w-4xl">
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">Compare</p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">Assessment Comparison</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {older.memoRun.target} vs {newer.memoRun.target} — older run on the left, more recent on the right.
        </p>

        <CompareView older={older} newer={newer} />
      </div>
    </div>
  );
}
