import { ClaimLabelBadge } from "@/components/claim-label-badge";
import { Badge } from "@/components/ui/badge";
import type { CompetitiveLandscape } from "@/lib/agents/persist";

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

export function CompetitiveLandscapeSection({ data }: { data: CompetitiveLandscape }) {
  return (
    <div className="flex flex-col gap-6">
      {data.approvedCompetitors.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Approved Competitors ({data.approvedCompetitors.length})
          </h3>
          <div className="flex flex-col gap-2">
            {data.approvedCompetitors.map((competitor) => (
              <div
                key={competitor.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{competitor.drug}</p>
                  <Badge variant="secondary">
                    {new Date(competitor.approvalDate).getFullYear()}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {competitor.company} · {competitor.mechanism}
                </p>
                <div className="mt-2">
                  <CitationLink citation={competitor.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.lateStagePipelineAssets.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Late-Stage Pipeline ({data.lateStagePipelineAssets.length})
          </h3>
          <div className="flex flex-col gap-2">
            {data.lateStagePipelineAssets.map((asset) => (
              <div
                key={asset.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{asset.drug}</p>
                  <Badge variant="secondary">{asset.phase}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {asset.company} · {asset.mechanism}
                </p>
                <p className="mt-1 text-sm text-foreground">{asset.status}</p>
                <div className="mt-2">
                  <CitationLink citation={asset.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.positioningGaps.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Positioning Gaps
          </h3>
          <div className="flex flex-col gap-2">
            {data.positioningGaps.map((gap) => (
              <div
                key={gap.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground">{gap.description}</p>
                  <ClaimLabelBadge label={gap.label} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
