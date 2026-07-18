import { ClaimLabelBadge } from "@/components/claim-label-badge";
import { Badge } from "@/components/ui/badge";
import type { ClinicalLandscape } from "@/lib/agents/persist";

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

export function ClinicalLandscapeSection({ data }: { data: ClinicalLandscape }) {
  return (
    <div className="flex flex-col gap-6">
      {data.mechanismSummary && (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Mechanism of Action
            </h3>
            {data.mechanismLabel && <ClaimLabelBadge label={data.mechanismLabel} />}
          </div>
          <p className="text-sm text-foreground">{data.mechanismSummary}</p>
        </div>
      )}

      {data.trials.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Trials ({data.trials.length})
          </h3>
          <div className="flex flex-col gap-2">
            {data.trials.map((trial) => (
              <div
                key={trial.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{trial.title}</p>
                  <Badge variant="secondary">{trial.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {trial.nctId} · {trial.phase} · {trial.sponsor}
                  {trial.enrollment ? ` · n=${trial.enrollment}` : ""}
                  {trial.isStale ? " · status may be stale" : ""}
                </p>
                {trial.primaryEndpoint && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Primary endpoint: {trial.primaryEndpoint}
                  </p>
                )}
                <div className="mt-2">
                  <CitationLink citation={trial.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.safetySignals.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Safety Signals
          </h3>
          <div className="flex flex-col gap-2">
            {data.safetySignals.map((signal) => (
              <div
                key={signal.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground">{signal.description}</p>
                  <ClaimLabelBadge label={signal.label} />
                </div>
                <div className="mt-2">
                  <CitationLink citation={signal.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.similarDrugFailures.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Similar Drug Failures
          </h3>
          <div className="flex flex-col gap-2">
            {data.similarDrugFailures.map((failure) => (
              <div
                key={failure.id}
                className="rounded-[9px] border border-border bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-brand-navy">{failure.drug}</p>
                  <ClaimLabelBadge label={failure.label} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {failure.reasonForFailure}
                </p>
                <div className="mt-2">
                  <CitationLink citation={failure.citation} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
