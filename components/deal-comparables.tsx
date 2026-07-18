import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

// compStrength is our actual schema field for "how directly comparable is
// this deal" — used here as the design reference's "Tag" column instead of
// fabricating a Fact/Inference label deals don't carry.
const COMP_STRENGTH_STYLES: Record<string, string> = {
  Direct: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Approximate: "border-blue-200 bg-blue-50 text-blue-700",
};

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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <TableHeader>Asset</TableHeader>
            <TableHeader>Counterparty</TableHeader>
            <TableHeader>Stage / Type</TableHeader>
            <TableHeader>Terms</TableHeader>
            <TableHeader>Tag</TableHeader>
          </tr>
        </thead>
        <tbody>
          {data.comparableDeals.map((deal) => (
            <tr key={deal.id} className="border-b border-border align-top last:border-b-0">
              <td className="px-3 py-2.5">
                <p className="font-medium text-brand-navy">{deal.asset}</p>
                <div className="mt-1">
                  <CitationLink citation={deal.citation} />
                </div>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{deal.company}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {deal.stageAtDeal} · {deal.dealType}
              </td>
              <td className="px-3 py-2.5 text-foreground">{deal.disclosedTerms}</td>
              <td className="px-3 py-2.5">
                <Badge variant="outline" className={cn("font-medium", COMP_STRENGTH_STYLES[deal.compStrength] ?? "")}>
                  {deal.compStrength}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
