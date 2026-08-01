import { Card, CardContent } from "@/components/ui/card";
import { BatchProfileForm } from "@/components/batch-profile-form";

export default function BatchPage() {
  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">
          Batch queue
        </p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
          Queue Multiple Assessments
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add several therapy profiles at once. They run automatically in the background, 2 at a
          time — queue them before you step away and check back later.
        </p>

        <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
          <CardContent>
            <BatchProfileForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
