import Link from "next/link";
import { listAssessments } from "@/lib/agents/persist";
import type { RunStatus } from "@/lib/memo/run-status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AssessmentsTable } from "@/components/assessments-table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const STATUS_FILTERS: { label: string; value: RunStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Complete", value: "Complete" },
  { label: "In Progress", value: "In Progress" },
  { label: "Failed", value: "Failed" },
  { label: "Queued", value: "Queued" },
];

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const status = typeof params.status === "string" ? (params.status as RunStatus) : undefined;
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);

  const { runs, total } = await listAssessments({ q, status, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div className="w-full max-w-4xl">
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">
          Assessments
        </p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
          All Assessments
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every commercialization assessment ever run, shared across the team.
        </p>

        <form action="/assessments" method="GET" className="mt-6 flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by target or indication…"
            className="h-9"
          />
          <Button type="submit" variant="outline" size="default">
            Search
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <Link
              key={filter.label}
              href={`/assessments${buildQuery({ q, status: filter.value })}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                status === filter.value
                  ? "border-brand-navy bg-brand-navy text-white"
                  : "border-border bg-white text-muted-foreground hover:border-brand-navy/30"
              )}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <div className="mt-6">
          {runs.length === 0 ? (
            <p className="rounded-[9px] border border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
              No assessments found.
            </p>
          ) : (
            <AssessmentsTable rows={runs} />
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link
              href={`/assessments${buildQuery({ q, status, page: page > 1 ? String(page - 1) : undefined })}`}
              aria-disabled={page <= 1}
              className={cn(
                "rounded-[9px] border border-border bg-white px-3 py-1.5 font-medium text-brand-navy hover:bg-slate-50",
                page <= 1 && "pointer-events-none opacity-40"
              )}
            >
              ← Previous
            </Link>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Link
              href={`/assessments${buildQuery({ q, status, page: String(page + 1) })}`}
              aria-disabled={page >= totalPages}
              className={cn(
                "rounded-[9px] border border-border bg-white px-3 py-1.5 font-medium text-brand-navy hover:bg-slate-50",
                page >= totalPages && "pointer-events-none opacity-40"
              )}
            >
              Next →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
