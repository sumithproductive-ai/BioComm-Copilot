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
      Source
    </a>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </th>
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <TableHeader>Therapy</TableHeader>
                  <TableHeader>Mechanism</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Source</TableHeader>
                </tr>
              </thead>
              <tbody>
                {data.approvedCompetitors.map((competitor) => (
                  <tr key={competitor.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-brand-navy">{competitor.drug}</p>
                      <p className="text-xs text-muted-foreground">{competitor.company}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{competitor.mechanism}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700">
                        Approved {new Date(competitor.approvalDate).getFullYear()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <CitationLink citation={competitor.citation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.lateStagePipelineAssets.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Late-Stage Pipeline ({data.lateStagePipelineAssets.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <TableHeader>Therapy</TableHeader>
                  <TableHeader>Mechanism</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Source</TableHeader>
                </tr>
              </thead>
              <tbody>
                {data.lateStagePipelineAssets.map((asset) => (
                  <tr key={asset.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-brand-navy">{asset.drug}</p>
                      <p className="text-xs text-muted-foreground">{asset.company}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{asset.mechanism}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="secondary">{asset.phase}</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">{asset.status}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <CitationLink citation={asset.citation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
