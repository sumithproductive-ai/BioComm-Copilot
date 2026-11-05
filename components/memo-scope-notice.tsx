import { isUcRelatedIndication } from "@/lib/config/uc-competitors";
import { DISCLAIMER_TEXT, NON_UC_SCOPE_TEXT } from "@/lib/memo-notices";

export function MemoScopeNotice({ indication }: { indication: string }) {
  return (
    <div className="space-y-1 rounded-[9px] border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
      <p>{DISCLAIMER_TEXT}</p>
      {!isUcRelatedIndication(indication) && <p>{NON_UC_SCOPE_TEXT}</p>}
    </div>
  );
}
