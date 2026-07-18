// Client-side "recent assessments" memory. Not a saved-history feature in the
// PRD.md non-goal sense — no accounts, nothing shared or synced, purely so a
// browser doesn't forget a run's URL the moment you navigate away. Addresses
// feedback from Maya (juggling 3-5 assets at once) and Priya (needs a memo
// again weeks later for a partner call) without touching the v1 no-accounts
// boundary.

const STORAGE_KEY = "biocomm:recent-runs";
const MAX_ENTRIES = 10;

export type RecentRun = {
  id: string;
  target: string;
  modality: string;
  stage: string;
  indication: string;
  createdAt: string;
};

export function getRecentRuns(): RecentRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EMPTY_RUNS: RecentRun[] = [];

// Snapshot cache for useSyncExternalStore: it requires getSnapshot to return
// a referentially stable value when the underlying data hasn't changed, or
// React treats every render as a store change and loops forever. Only
// re-parse when the raw localStorage string actually differs from last read.
let cachedRaw: string | null = null;
let cachedRuns: RecentRun[] = EMPTY_RUNS;

export function getRecentRunsSnapshot(): RecentRun[] {
  if (typeof window === "undefined") return EMPTY_RUNS;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_RUNS;
  }
  if (raw === cachedRaw) return cachedRuns;
  cachedRaw = raw;
  cachedRuns = raw ? getRecentRuns() : EMPTY_RUNS;
  return cachedRuns;
}

export function getRecentRunsServerSnapshot(): RecentRun[] {
  return EMPTY_RUNS;
}

export function addRecentRun(run: RecentRun) {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentRuns().filter((r) => r.id !== run.id);
    const next = [run, ...existing].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, quota) — fine to no-op
  }
}
