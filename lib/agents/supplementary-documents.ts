// Shared formatting for user-uploaded supplementary documents (PDFs) —
// every research agent accepts an optional supplementaryDocuments string
// and appends this same block to its initial user message when present.
// Confirmed product decision: these are treated as strong, asset-specific
// context (uploaded documents are usually company-provided materials, not
// generic web content) but NOT automatically "Fact" — a document can
// itself contain the company's own projections, estimates, or marketing
// claims, so agents still apply the normal Fact/Assumption/Inference/
// Unknown labeling per claim, same discipline as any other source.

export function formatSupplementaryDocuments(supplementaryDocuments?: string): string {
  if (!supplementaryDocuments) return "";
  return `\n\nThe user has also provided the following supplementary document(s) as additional context for this specific asset — treat this as a strong, asset-specific primary source (more specific than general web search), but it is not automatically "Fact": label each claim you draw from it the same way you would any other source, based on how directly and confidently it states that claim, not just because it came from an uploaded document. If the document is itself reporting the company's own projections or estimates, that's still Assumption or Inference, not Fact.\n\n${supplementaryDocuments}`;
}
