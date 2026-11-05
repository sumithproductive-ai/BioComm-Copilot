// Pure scoring helpers for the benchmark. Pass marks are product decisions,
// not an industry standard. Anything needing human judgment is reported as
// NOT MEASURED instead of being assumed to pass.
export type GateStatus = "PASS" | "FAIL" | "NOT MEASURED";

export function collectStrings(value: unknown, key: string, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => collectStrings(item, key, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === key && typeof v === "string") found.push(v);
      else collectStrings(v, key, found);
    }
  }
  return found;
}

export function competitorRecall(reported: string[], expected: string[]): { recall: number; missing: string[] } {
  const normalized = reported.map((name) => name.toLowerCase());
  const missing = expected.filter((name) => !normalized.some((r) => r.includes(name.toLowerCase())));
  return { recall: expected.length === 0 ? 1 : (expected.length - missing.length) / expected.length, missing };
}

// Share of repeat runs that agree with the most common recommendation.
export function stability(values: string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

export function gate(value: number | null, passMark: number): GateStatus {
  if (value === null) return "NOT MEASURED";
  return value >= passMark ? "PASS" : "FAIL";
}

export type UrlCheck = "ok" | "blocked" | "dead" | "error";

// 401/403/429 means the site refused a script, which says nothing about
// whether the page exists, so "blocked" needs a human rather than a fail.
export function classifyStatus(status: number): UrlCheck {
  if (status >= 200 && status < 400) return "ok";
  if (status === 401 || status === 403 || status === 429) return "blocked";
  if (status === 404 || status === 410) return "dead";
  return "error";
}

// Rule of three: zero failures in n checks bounds the true failure rate at
// about 3/n with 95% confidence.
export function zeroFailureUpperBound(n: number): number | null {
  return n > 0 ? 3 / n : null;
}

export function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
