import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The Fact/Assumption/Inference/Unknown labeling system is the core trust
// mechanism described in PRODUCT_BRIEF.md's Trust & Credibility Standards —
// reusable across every memo section, not just Clinical Landscape. Colors
// match the design reference exactly (Fact/Assumption already did; Inference
// is blue not sky, Unknown is neutral slate not red — red is reserved for
// actual alerts elsewhere, not just "we don't know").
const LABEL_STYLES: Record<string, string> = {
  Fact: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Assumption: "bg-amber-50 text-amber-700 border-amber-200",
  Inference: "bg-blue-50 text-blue-700 border-blue-200",
  Unknown: "bg-slate-100 text-slate-600 border-slate-200",
};

export function ClaimLabelBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", LABEL_STYLES[label] ?? "")}
    >
      {label}
    </Badge>
  );
}
