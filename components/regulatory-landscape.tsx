import { ClaimLabelBadge } from "@/components/claim-label-badge";
import type { RegulatoryLandscape } from "@/lib/agents/persist";

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

export function RegulatoryLandscapeSection({ data }: { data: RegulatoryLandscape }) {
  return (
    <div className="flex flex-col gap-6">
      {data.developmentTimelineSummary && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Development Timeline Estimate
            </h3>
            {data.developmentTimelineLabel && (
              <ClaimLabelBadge label={data.developmentTimelineLabel} />
            )}
          </div>
          <p className="text-sm text-foreground">{data.developmentTimelineSummary}</p>
        </div>
      )}

      {data.endpointPrecedents.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Endpoint Precedent
          </h3>
          <div className="flex flex-col gap-2">
            {data.endpointPrecedents.map((precedent) => (
              <div
                key={precedent.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <p className="text-sm font-medium text-brand-navy">{precedent.endpoint}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sourced from: {precedent.sourcedFromLabels.join(", ")}
                </p>
                {precedent.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {precedent.citations.map((ref) => (
                      <CitationLink key={ref.citationId} citation={ref.citation} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.priorApprovals.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Prior Approvals (Same Mechanism)
          </h3>
          <div className="flex flex-col gap-2">
            {data.priorApprovals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{approval.drug}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(approval.approvalDate).getFullYear()}
                  </p>
                </div>
                <div className="mt-2">
                  <CitationLink citation={approval.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.guidanceDocuments.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Guidance Documents
          </h3>
          <div className="flex flex-col gap-2">
            {data.guidanceDocuments.map((doc) => (
              <div key={doc.id} className="rounded-[9px] border border-border bg-white px-4 py-3">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand-navy underline underline-offset-2"
                >
                  {doc.title}
                </a>
                <p className="mt-1 text-xs text-muted-foreground">{doc.relevance}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
