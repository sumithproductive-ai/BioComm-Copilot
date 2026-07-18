import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The Fact/Assumption/Inference/Unknown labeling system is the core trust
// mechanism described in PRODUCT_BRIEF.md's Trust & Credibility Standards —
// reusable across every memo section, not just Clinical Landscape.
const LABEL_STYLES: Record<string, string> = {
  Fact: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Assumption: "bg-amber-50 text-amber-700 border-amber-200",
  Inference: "bg-sky-50 text-sky-700 border-sky-200",
  Unknown: "bg-red-50 text-red-700 border-red-200",
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
