export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="size-[15px] rotate-45 rounded-[2px] bg-brand-amber" />
      <span className="text-base">
        <span className="font-bold text-brand-navy">BioComm</span>{" "}
        <span className="font-normal text-muted-foreground">Copilot</span>
      </span>
    </div>
  );
}
