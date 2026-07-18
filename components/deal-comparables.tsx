import { Badge } from "@/components/ui/badge";
import type { DealComparablesLandscape } from "@/lib/agents/persist";

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

export function DealComparablesSection({ data }: { data: DealComparablesLandscape }) {
  if (data.noCompFound) {
    return (
      <div className="rounded-[9px] border border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-brand-navy">No comparable deal found</p>
          <Badge variant="outline" className="border-amber-200 bg-amber-50 font-medium text-amber-700">
            No fabrication
          </Badge>
        </div>
        {data.noCompExplanation && (
          <p className="mt-1 text-sm text-muted-foreground">{data.noCompExplanation}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.comparableDeals.map((deal) => (
        <div key={deal.id} className="rounded-[9px] border border-border bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-brand-navy">{deal.asset}</p>
            <Badge variant="secondary">{deal.compStrength}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {deal.company} · {deal.stageAtDeal} · {deal.dealType}
          </p>
          <p className="mt-1 text-sm text-foreground">{deal.disclosedTerms}</p>
          <div className="mt-2">
            <CitationLink citation={deal.citation} />
          </div>
        </div>
      ))}
    </div>
  );
}
