"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getRecentRunsSnapshot,
  getRecentRunsServerSnapshot,
} from "@/lib/recent-runs";
import { relativeTime } from "@/lib/format-time";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function RecentRunsList() {
  // useSyncExternalStore (not state-in-effect) so the first client render
  // matches the server-rendered snapshot ([]) and avoids a hydration
  // mismatch, then switches to the real localStorage contents post-hydration.
  const runs = useSyncExternalStore(
    subscribe,
    getRecentRunsSnapshot,
    getRecentRunsServerSnapshot
  );

  if (runs.length === 0) return null;

  return (
    <div className="mt-10">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Recent assessments on this device
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/memo/${run.id}`}
            className="flex items-center justify-between rounded-[9px] border border-border bg-white px-4 py-3 text-sm transition-colors hover:border-brand-navy/30 hover:bg-secondary"
          >
            <span>
              <span className="font-medium text-brand-navy">{run.target}</span>
              <span className="text-muted-foreground">
                {" "}
                · {run.modality} · {run.stage}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {relativeTime(run.createdAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
