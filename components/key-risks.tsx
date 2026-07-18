import { ClaimLabelBadge } from "@/components/claim-label-badge";
import type { KeyRisksAndRecommendations } from "@/lib/agents/persist";

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

export function KeyRisksSection({ data }: { data: KeyRisksAndRecommendations }) {
  return (
    <div className="flex flex-col gap-2">
      {data.keyRisks.map((risk) => (
        <div key={risk.id} className="rounded-[9px] border border-border bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-foreground">{risk.description}</p>
            <ClaimLabelBadge label={risk.label} />
          </div>
          <div className="mt-2">
            <CitationLink citation={risk.citation} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RouteRecommendationsSection({ data }: { data: KeyRisksAndRecommendations }) {
  return (
    <div className="flex flex-col gap-2">
      {data.routeRecommendations.map((recommendation) => (
        <div key={recommendation.id} className="rounded-[9px] border border-border bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-foreground">{recommendation.description}</p>
            <ClaimLabelBadge label={recommendation.label} />
          </div>
        </div>
      ))}
    </div>
  );
}
