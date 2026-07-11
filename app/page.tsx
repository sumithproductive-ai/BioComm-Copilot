import { Card, CardContent } from "@/components/ui/card";
import { TherapyProfileForm } from "@/components/therapy-profile-form";

export default function Home() {
  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">
          New assessment
        </p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">
          New Commercialization Assessment
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter a therapeutic asset. Specialized agents will research and
          assemble a source-cited intelligence memo.
        </p>

        <Card className="mt-6 [--card-spacing:1.75rem] rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
          <CardContent>
            <TherapyProfileForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
