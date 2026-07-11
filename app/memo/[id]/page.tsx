import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>{memoRun.target}</CardTitle>
          <CardDescription>
            {memoRun.modality} · {memoRun.stage} · {memoRun.indication}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {memoRun.context && (
            <p className="text-sm text-muted-foreground">{memoRun.context}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Assessment queued. Agent orchestration and the full memo render are
            not wired up yet — this run is saved as{" "}
            <code className="text-xs">{memoRun.id}</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
