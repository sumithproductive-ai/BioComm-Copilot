"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const EPISTEMIC_KEY: { label: string; colorClass: string }[] = [
  { label: "Fact", colorClass: "bg-emerald-500" },
  { label: "Inference", colorClass: "bg-blue-500" },
  { label: "Assumption", colorClass: "bg-amber-500" },
  { label: "Unknown", colorClass: "bg-slate-400" },
];

export type MemoTocSection = { id: string; label: string };

// Sticky sidebar nav — numbered section list with scroll-spy active-state
// highlighting, plus the Epistemic Key legend. Client component only for
// the IntersectionObserver; the section list itself is server-computed
// (page.tsx only includes sections that actually rendered that run).
export function MemoToc({ sections }: { sections: MemoTocSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveId(topMost.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="sticky top-6 flex w-full flex-col gap-6">
      <div>
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Memo Contents
        </p>
        <ol className="flex flex-col gap-0.5">
          {sections.map((section, i) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={cn(
                    "flex items-baseline gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "border-brand-navy bg-slate-100 font-semibold text-brand-navy"
                      : "border-transparent text-muted-foreground hover:bg-slate-50 hover:text-foreground"
                  )}
                >
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {section.label}
                </a>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Epistemic Key
        </p>
        <ul className="flex flex-col gap-1.5">
          {EPISTEMIC_KEY.map((entry) => (
            <li key={entry.label} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={cn("size-2.5 rounded-sm", entry.colorClass)} />
              {entry.label}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
