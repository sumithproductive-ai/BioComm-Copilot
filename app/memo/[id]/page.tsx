import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { RecordRecentRun } from "@/components/record-recent-run";

export default async function MemoRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memoRun = await db.memoRun.findUnique({ where: { id } });

  if (!memoRun) {
    notFound();
  }

  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div className="w-full max-w-xl">
        <RecordRecentRun
          run={{
            id: memoRun.id,
            target: memoRun.target,
            modality: memoRun.modality,
            stage: memoRun.stage,
            indication: memoRun.indication,
            createdAt: memoRun.createdAt.toISOString(),
          }}
        />
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">
          Assessment queued
        </p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
          {memoRun.target}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {memoRun.modality} · {memoRun.stage} · {memoRun.indication}
        </p>

        <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
          <CardContent className="flex flex-col gap-4">
            {memoRun.context && (
              <p className="text-sm text-muted-foreground">{memoRun.context}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Agent orchestration and the full memo render are not wired up
              yet — this run is saved as{" "}
              <code className="text-xs">{memoRun.id}</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
