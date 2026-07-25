// Hardcoded "major UC competitor" reference list — AGENT_PLAN.md §5.2.
//
// Used by two agents:
// - Competitive Intelligence Agent diffs its `approved_competitors` output
//   against this list to make sure nothing major is missing before returning.
// - Critic Agent runs the same diff independently as its completeness check
//   (Story 5 AC: "Critic Agent flags the section if a hardcoded major
//   competitor is missing from the output").
//
// AGENT_PLAN.md §5.2: "owned by Product, revisited quarterly ... store as a
// versioned config file (not buried in a prompt) so it's easy to update as
// new UC approvals happen."
//
// Approval years below are public knowledge and high-confidence, but are
// approximate (year-level, not exact date) and should be verified against
// FDA.gov / the drug's label before the Critic Agent treats them as
// ground truth for a specific claim.

export type UcCompetitor = {
  /** Generic/INN drug name — what agents should match against. */
  drug: string;
  brandName: string;
  company: string;
  mechanism: string;
  /** Year of first FDA approval for a UC indication (approximate). */
  approvedYear: number;
};

// Matches a reported drug name against this reference list. Deliberately a
// substring check, not exact equality: confirmed live (comprehensive review,
// 2026-07-25) that agents inconsistently report drug names as either the
// bare generic ("Vedolizumab") or "Generic (Brand)" ("Vedolizumab
// (Entyvio)") — exact matching silently zeroed out
// competitiveCoverageCompleteness (a 20%-weighted Confidence Score
// component) for a run whose competitor list was actually 100% complete,
// corrupting the displayed score by ~2 points. Both the drug's generic name
// and its brand name are checked as substrings so either reporting style
// matches. Shared by competitive-intelligence.ts's missing-competitor retry
// check and synthesis.ts's confidence sub-score — do not duplicate this
// logic, both call sites must agree on what "present" means.
export function isReferenceCompetitorReported(
  reference: UcCompetitor,
  reportedDrugNames: string[]
): boolean {
  const generic = reference.drug.toLowerCase();
  const brand = reference.brandName.toLowerCase();
  return reportedDrugNames.some((reported) => {
    const normalized = reported.toLowerCase();
    return normalized.includes(generic) || normalized.includes(brand);
  });
}

export function findMissingReferenceCompetitors(reportedDrugNames: string[]): UcCompetitor[] {
  return UC_COMPETITOR_REFERENCE_LIST.filter(
    (reference) => !isReferenceCompetitorReported(reference, reportedDrugNames)
  );
}

export const UC_COMPETITOR_REFERENCE_LIST: UcCompetitor[] = [
  {
    drug: "Vedolizumab",
    brandName: "Entyvio",
    company: "Takeda",
    mechanism: "Anti-integrin (α4β7)",
    approvedYear: 2014,
  },
  {
    drug: "Ustekinumab",
    brandName: "Stelara",
    company: "Johnson & Johnson",
    mechanism: "Anti-IL-12/23 (p40 subunit)",
    approvedYear: 2019,
  },
  {
    drug: "Infliximab",
    brandName: "Remicade",
    company: "Johnson & Johnson",
    mechanism: "Anti-TNF-alpha",
    approvedYear: 2005,
  },
  {
    drug: "Adalimumab",
    brandName: "Humira",
    company: "AbbVie",
    mechanism: "Anti-TNF-alpha",
    approvedYear: 2012,
  },
  {
    drug: "Golimumab",
    brandName: "Simponi",
    company: "Johnson & Johnson",
    mechanism: "Anti-TNF-alpha",
    approvedYear: 2013,
  },
  {
    drug: "Tofacitinib",
    brandName: "Xeljanz",
    company: "Pfizer",
    mechanism: "JAK inhibitor (pan-JAK)",
    approvedYear: 2018,
  },
  {
    drug: "Upadacitinib",
    brandName: "Rinvoq",
    company: "AbbVie",
    mechanism: "JAK1 inhibitor",
    approvedYear: 2022,
  },
  {
    drug: "Ozanimod",
    brandName: "Zeposia",
    company: "Bristol Myers Squibb",
    mechanism: "S1P1/S1P5 receptor modulator",
    approvedYear: 2021,
  },
  {
    drug: "Etrasimod",
    brandName: "Velsipity",
    company: "Pfizer",
    mechanism: "S1P1/S1P4/S1P5 receptor modulator",
    approvedYear: 2023,
  },
  {
    drug: "Risankizumab",
    brandName: "Skyrizi",
    company: "AbbVie",
    mechanism: "Anti-IL-23 (p19 subunit)",
    approvedYear: 2024,
  },
  {
    drug: "Mirikizumab",
    brandName: "Omvoh",
    company: "Eli Lilly",
    mechanism: "Anti-IL-23 (p19 subunit)",
    approvedYear: 2023,
  },
];
