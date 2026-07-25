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

function TableHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-border px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase",
        className
      )}
    >
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
    // table-fixed with explicit per-column widths: the previous w-full +
    // content-driven layout let a long Terms cell starve the Tag column
    // down to a sliver, clipping the compStrength badge mid-word — and a
    // first attempt at fixing this by letting the table grow past its
    // container (min-w-full + overflow-x-auto) technically stopped the
    // internal clipping but just pushed Tag out of the default scroll
    // viewport instead, which still looked broken with no visible
    // affordance to scroll (confirmed live, comprehensive review,
    // 2026-07-25). table-fixed gives Tag a guaranteed share of the width
    // no matter how long Terms' free text is — Terms wraps onto more
    // lines instead of pushing other columns out of view.
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <TableHeader className="w-[20%]">Asset</TableHeader>
            <TableHeader className="w-[15%]">Counterparty</TableHeader>
            <TableHeader className="w-[15%]">Stage / Type</TableHeader>
            <TableHeader className="w-[33%]">Terms</TableHeader>
            <TableHeader className="w-[17%]">Tag</TableHeader>
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
