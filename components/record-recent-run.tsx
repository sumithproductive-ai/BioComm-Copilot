"use client";

import { useEffect } from "react";
import { addRecentRun, type RecentRun } from "@/lib/recent-runs";

// Renders nothing — just records this run into the browser's recent-runs list
// on mount so it shows up on the home page next visit.
export function RecordRecentRun({ run }: { run: RecentRun }) {
  useEffect(() => {
    addRecentRun(run);
  }, [run]);

  return null;
}
