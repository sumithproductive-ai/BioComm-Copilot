import { notFound } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import {
  getClinicalLandscape,
  getCompetitiveLandscape,
  getCommercialOpportunity,
  getRegulatoryLandscape,
  getDealComparablesLandscape,
  getReviewerNotes,
  getDecisionSummary,
  getKeyRisksAndRecommendations,
  getSourceIndex,
} from "@/lib/agents/persist";
import { computeEpistemicLedger } from "@/lib/memo/epistemic-ledger";
import { isValidUuid } from "@/lib/memo/is-valid-uuid";
import { AssessmentReportDocument } from "@/lib/pdf/assessment-report";

// Same data, different rendering target as app/memo/[id]/page.tsx — reuses
// every getter directly rather than re-deriving anything.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();
  const memoRun = await db.memoRun.findUnique({
    where: { id },
    select: { target: true, modality: true, stage: true, indication: true, context: true },
  });
  if (!memoRun) notFound();

  const [
    clinicalLandscape,
    competitiveLandscape,
    commercialOpportunity,
    regulatoryLandscape,
    dealComparablesLandscape,
    reviewerNotes,
    decisionSummary,
    keyRisksAndRecommendations,
    sourceIndex,
  ] = await Promise.all([
    getClinicalLandscape(id),
    getCompetitiveLandscape(id),
    getCommercialOpportunity(id),
    getRegulatoryLandscape(id),
    getDealComparablesLandscape(id),
    getReviewerNotes(id),
    getDecisionSummary(id),
    getKeyRisksAndRecommendations(id),
    getSourceIndex(id),
  ]);

  const epistemicLedger = computeEpistemicLedger({
    clinical: clinicalLandscape,
    competitive: competitiveLandscape,
    commercial: commercialOpportunity,
    regulatory: regulatoryLandscape,
    keyRisksAndRecommendations,
  });

  const buffer = await renderToBuffer(
    <AssessmentReportDocument
      memoRun={memoRun}
      decisionSummary={decisionSummary}
      epistemicLedger={epistemicLedger}
      clinical={clinicalLandscape}
      competitive={competitiveLandscape}
      commercial={commercialOpportunity}
      regulatory={regulatoryLandscape}
      dealComparables={dealComparablesLandscape}
      keyRisksAndRecommendations={keyRisksAndRecommendations}
      reviewerNotes={reviewerNotes}
      sourceIndex={sourceIndex}
      generatedAt={new Date()}
    />
  );

  const fileSafeTarget = memoRun.target.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="biocomm-${fileSafeTarget}.pdf"`,
    },
  });
}
