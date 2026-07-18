type Citation = {
  id: string;
  sourceType: string;
  sourceUrl: string;
  accessedDate: Date;
  publishedDate: Date | null;
};

// PRODUCT_BRIEF.md memo section 10 — every citation used anywhere in the
// memo, with access dates, in one place (Story 10 AC: "Source Index at the
// bottom of the memo lists every citation with URL and access date").
export function SourceIndexSection({ citations }: { citations: Citation[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {citations.map((citation) => (
        <div
          key={citation.id}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border py-2 text-xs last:border-b-0"
        >
          <a
            href={citation.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-foreground underline underline-offset-2 hover:text-brand-navy"
          >
            {citation.sourceUrl}
          </a>
          <span className="shrink-0 text-muted-foreground">
            {citation.sourceType} · accessed {citation.accessedDate.toISOString().slice(0, 10)}
          </span>
        </div>
      ))}
    </div>
  );
}
