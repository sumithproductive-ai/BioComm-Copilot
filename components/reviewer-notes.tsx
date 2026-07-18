import { Badge } from "@/components/ui/badge";
import type { ReviewerNotes as ReviewerNotesData } from "@/lib/agents/persist";

// USER_STORIES.md Story 9 AC: human-readable label per CriticFlagType.
const FLAG_TYPE_LABELS: Record<string, string> = {
  UnsupportedClaim: "Unsupported claim",
  MissingCompetitor: "Missing competitor",
  AssumptionAsFact: "Assumption presented as fact",
  UndisclosedTerms: "Undisclosed terms",
  StaleData: "Outdated data",
  OverconfidentRegulatory: "Overconfident regulatory claim",
  Contradiction: "Cross-section contradiction",
};

// Story 9 AC: "Section is visually distinct (e.g. bordered callout) so it
// is not confused with memo content" — this is the only section on the
// page with a colored left border for that reason.
export function ReviewerNotesSection({ data }: { data: ReviewerNotesData }) {
  const hasFlags = data.criticFlags.length > 0;

  return (
    <div
      className={`rounded-[9px] border-l-4 bg-white px-4 py-3 ${
        hasFlags ? "border-l-amber-500" : "border-l-emerald-500"
      }`}
    >
      {!hasFlags && (
        <p className="text-sm text-muted-foreground">
          {data.reviewerNotesSummary ??
            "No critical flags identified — standard human review still required."}
        </p>
      )}

      {hasFlags && (
        <div className="flex flex-col gap-2">
          {data.criticFlags.map((flag) => (
            <div key={flag.id} className="rounded-[9px] border border-border bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-brand-navy">{flag.section}</p>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 font-medium text-amber-700">
                  {FLAG_TYPE_LABELS[flag.type] ?? flag.type}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-foreground">{flag.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
