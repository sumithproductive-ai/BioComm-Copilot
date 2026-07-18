import { EPISTEMIC_LABELS, type EpistemicLedger } from "@/lib/memo/epistemic-ledger";
import { cn } from "@/lib/utils";

const LABEL_BAR_STYLES: Record<string, string> = {
  Fact: "bg-emerald-500",
  Inference: "bg-blue-500",
  Assumption: "bg-amber-500",
  Unknown: "bg-slate-400",
};

const LABEL_TEXT_STYLES: Record<string, string> = {
  Fact: "text-emerald-700",
  Inference: "text-blue-700",
  Assumption: "text-amber-700",
  Unknown: "text-slate-600",
};

const LABEL_DEFINITIONS: { label: string; definition: string }[] = [
  { label: "Fact", definition: "Independently verifiable and directly sourced (a trial ID, a filing, a label)." },
  { label: "Inference", definition: "A reasoned conclusion drawn from the available sourced data, not stated outright by any one source." },
  { label: "Assumption", definition: "A working premise the memo relies on that has not been directly confirmed." },
  { label: "Unknown", definition: "An acknowledged gap — no reliable source was found, stated plainly rather than guessed at." },
];

export function EpistemicLedgerSection({ data }: { data: EpistemicLedger }) {
  const maxCount = Math.max(1, ...EPISTEMIC_LABELS.map((label) => data.counts[label]));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">How much of this memo is known vs. inferred</p>

      <div className="flex flex-col gap-2.5">
        {EPISTEMIC_LABELS.map((label) => (
          <div key={label} className="flex items-center gap-3">
            <span
              className={cn(
                "w-24 shrink-0 text-xs font-semibold tracking-wide uppercase",
                LABEL_TEXT_STYLES[label]
              )}
            >
              {label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", LABEL_BAR_STYLES[label])}
                style={{ width: `${(data.counts[label] / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-sm font-medium text-foreground">
              {data.counts[label]}
            </span>
          </div>
        ))}
      </div>

      {data.sampleClaims.length > 0 && (
        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Sample Tagged Claims
          </h3>
          <div className="flex flex-col gap-1.5">
            {data.sampleClaims.map((claim, i) => (
              <p key={i} className="line-clamp-1 text-xs text-muted-foreground">
                <span className={cn("mr-1.5 font-semibold uppercase", LABEL_TEXT_STYLES[claim.label])}>
                  {claim.label}
                </span>
                {claim.text}
              </p>
            ))}
          </div>
        </div>
      )}

      <details className="rounded-[9px] border border-border bg-white px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          How claims are labeled
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          {LABEL_DEFINITIONS.map((entry) => (
            <p key={entry.label} className="text-xs text-muted-foreground">
              <span className={cn("mr-1.5 font-semibold uppercase", LABEL_TEXT_STYLES[entry.label])}>
                {entry.label}
              </span>
              {entry.definition}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}
