import { ClaimLabelBadge } from "@/components/claim-label-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PatentLandscape } from "@/lib/agents/persist";

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

const STATUS_STYLES: Record<string, string> = {
  Granted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Pending: "border-blue-200 bg-blue-50 text-blue-700",
  Expired: "border-slate-200 bg-slate-100 text-slate-600",
  Abandoned: "border-red-200 bg-red-50 text-red-700",
};

export function PatentLandscapeSection({ data }: { data: PatentLandscape }) {
  return (
    <div className="flex flex-col gap-6">
      {data.patentLandscapeSummary && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Landscape Summary
            </h3>
            {data.patentLandscapeLabel && <ClaimLabelBadge label={data.patentLandscapeLabel} />}
          </div>
          <p className="text-sm text-foreground">{data.patentLandscapeSummary}</p>
        </div>
      )}

      {data.patents.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Patents ({data.patents.length})
          </h3>
          <div className="flex flex-col gap-2">
            {data.patents.map((patent) => (
              <div key={patent.id} className="rounded-[9px] border border-border bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{patent.title}</p>
                  <Badge variant="outline" className={cn("font-medium shrink-0", STATUS_STYLES[patent.status] ?? "")}>
                    {patent.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {patent.patentNumber} · {patent.applicant}
                  {patent.publicationDate
                    ? ` · published ${new Date(patent.publicationDate).getFullYear()}`
                    : ""}
                </p>
                <div className="mt-1.5">
                  <ClaimLabelBadge label={patent.label} />
                </div>
                <p className="mt-1.5 text-sm text-foreground">{patent.relevance}</p>
                <div className="mt-2">
                  <CitationLink citation={patent.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
