import { ClaimLabelBadge } from "@/components/claim-label-badge";
import { Badge } from "@/components/ui/badge";
import type { CommercialOpportunity } from "@/lib/agents/persist";

function CitationLink({
  citation,
}: {
  citation: { sourceUrl: string; sourceType: string } | null;
}) {
  if (!citation) return null;
  return (
    <a
      href={citation.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-brand-navy"
    >
      Source ({citation.sourceType})
    </a>
  );
}

export function CommercialOpportunitySection({ data }: { data: CommercialOpportunity }) {
  return (
    <div className="flex flex-col gap-6">
      {data.patientPopulationValue && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Patient Population Estimate
            </h3>
            {data.patientPopulationLabel && <ClaimLabelBadge label={data.patientPopulationLabel} />}
          </div>
          <p className="text-sm text-foreground">{data.patientPopulationValue}</p>
          <div className="mt-2">
            <CitationLink citation={data.patientPopulationCitation} />
          </div>
        </div>
      )}

      {data.unmetNeedSummary && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Unmet Need
          </h3>
          <p className="text-sm text-foreground">{data.unmetNeedSummary}</p>
          {data.unmetNeedCitations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {data.unmetNeedCitations.map((ref) => (
                <CitationLink key={ref.citationId} citation={ref.citation} />
              ))}
            </div>
          )}
        </div>
      )}

      {data.marketCrowdingSummary && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Market Crowding
            </h3>
            {data.marketCrowdingConsistent === false && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 font-medium text-amber-700">
                Contradicts competitive landscape
              </Badge>
            )}
          </div>
          <p className="text-sm text-foreground">{data.marketCrowdingSummary}</p>
        </div>
      )}

      {data.differentiationSummary && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Differentiation Potential
            </h3>
            {data.differentiationLabel && <ClaimLabelBadge label={data.differentiationLabel} />}
          </div>
          <p className="text-sm text-foreground">{data.differentiationSummary}</p>
        </div>
      )}
    </div>
  );
}
