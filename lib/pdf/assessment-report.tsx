import { Document, Page, View, Text, StyleSheet, Svg, Rect, Link } from "@react-pdf/renderer";
import type {
  ClinicalLandscape,
  CompetitiveLandscape,
  CommercialOpportunity,
  RegulatoryLandscape,
  DealComparablesLandscape,
  PatentLandscape,
  ReviewerNotes,
  DecisionSummaryRecord,
  KeyRisksAndRecommendations,
} from "@/lib/agents/persist";
import { EPISTEMIC_LABELS, type EpistemicLedger } from "@/lib/memo/epistemic-ledger";

// Audit-format PDF export — mirrors app/memo/[id]/page.tsx's section order
// and the same has*/tocSections visibility rules, fed by the exact same
// lib/agents/persist.ts getters (identical data, different rendering
// target). Built with @react-pdf/renderer instead of a headless-browser
// print (e.g. Puppeteer) specifically to avoid bundling a Chromium binary
// into the deploy image — see Dockerfile's comment on why the image is
// already fighting to stay minimal.

const COLORS = {
  navy: "#0f1f3d",
  amber: "#f59e0b",
  muted: "#64748b",
  border: "#e2e8f0",
  fact: "#10b981",
  inference: "#3b82f6",
  assumption: "#f59e0b",
  unknown: "#94a3b8",
};

const LABEL_COLORS: Record<string, string> = {
  Fact: COLORS.fact,
  Inference: COLORS.inference,
  Assumption: COLORS.assumption,
  Unknown: COLORS.unknown,
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  UnsupportedClaim: "Unsupported claim",
  MissingCompetitor: "Missing competitor",
  AssumptionAsFact: "Assumption presented as fact",
  UndisclosedTerms: "Undisclosed terms",
  StaleData: "Outdated data",
  OverconfidentRegulatory: "Overconfident regulatory claim",
  Contradiction: "Cross-section contradiction",
};

const NEXT_STEP_LABELS: Record<string, string> = {
  ContinueDiligence: "Continue diligence",
  GatherMoreData: "Gather more data",
  DoNotPursue: "Do not pursue",
};

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 48, paddingHorizontal: 44, fontSize: 10, color: "#1e293b" },
  eyebrow: { fontSize: 8, fontWeight: 700, color: COLORS.amber, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: 700, color: COLORS.navy, marginTop: 4 },
  subtitle: { fontSize: 10, color: COLORS.muted, marginTop: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.navy,
    marginTop: 20,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  subheading: { fontSize: 9, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", marginBottom: 3 },
  body: { fontSize: 10, lineHeight: 1.4, color: "#334155" },
  muted: { fontSize: 8.5, color: COLORS.muted },
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 8, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tag: { fontSize: 8, fontWeight: 700, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  statTile: { width: "23%", borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 6 },
  statLabel: { fontSize: 7.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase" },
  statValue: { fontSize: 13, fontWeight: 700, color: COLORS.navy, marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 7.5, color: COLORS.muted },
  link: { color: COLORS.navy, textDecoration: "underline" },
});

function Tag({ text, color }: { text: string; color: string }) {
  return <Text style={[styles.tag, { color, backgroundColor: `${color}1a` }]}>{text}</Text>;
}

function ClaimTag({ label }: { label: string }) {
  return <Tag text={label} color={LABEL_COLORS[label] ?? COLORS.muted} />;
}

function CitationLine({ citation }: { citation: { sourceUrl: string; sourceType: string } | null }) {
  if (!citation) return null;
  return (
    <Link src={citation.sourceUrl} style={[styles.muted, styles.link]}>
      Source ({citation.sourceType})
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const widthPct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
      <Text style={{ width: 70, fontSize: 8, color: COLORS.muted }}>{label}</Text>
      <Svg width={200} height={8} style={{ marginHorizontal: 6 }}>
        <Rect x={0} y={0} width={200} height={8} rx={2} fill="#f1f5f9" />
        <Rect x={0} y={0} width={(widthPct / 100) * 200} height={8} rx={2} fill={color} />
      </Svg>
      <Text style={{ fontSize: 9, fontWeight: 700 }}>{value}</Text>
    </View>
  );
}

export type AssessmentReportProps = {
  memoRun: { target: string; modality: string; stage: string; indication: string; context: string | null };
  decisionSummary: DecisionSummaryRecord | null;
  epistemicLedger: EpistemicLedger;
  clinical: ClinicalLandscape | null;
  competitive: CompetitiveLandscape | null;
  commercial: CommercialOpportunity | null;
  regulatory: RegulatoryLandscape | null;
  dealComparables: DealComparablesLandscape | null;
  patents: PatentLandscape | null;
  keyRisksAndRecommendations: KeyRisksAndRecommendations | null;
  reviewerNotes: ReviewerNotes | null;
  sourceIndex: { id: string; sourceUrl: string; sourceType: string; accessedDate: Date }[];
  generatedAt: Date;
};

export function AssessmentReportDocument({
  memoRun,
  decisionSummary,
  epistemicLedger,
  clinical,
  competitive,
  commercial,
  regulatory,
  dealComparables,
  patents,
  keyRisksAndRecommendations,
  reviewerNotes,
  sourceIndex,
  generatedAt,
}: AssessmentReportProps) {
  const summary = decisionSummary?.decisionSummary;
  const epistemicMax = Math.max(1, ...EPISTEMIC_LABELS.map((l) => epistemicLedger.counts[l]));

  return (
    <Document title={`${memoRun.target} — BioComm Copilot Assessment`}>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>BioComm Copilot · Commercialization Assessment</Text>
        <Text style={styles.title}>{memoRun.target}</Text>
        <Text style={styles.subtitle}>
          {memoRun.modality} · {memoRun.stage} · {memoRun.indication}
        </Text>
        <Text style={[styles.muted, { marginTop: 2 }]}>
          Generated {generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </Text>
        {memoRun.context && <Text style={[styles.body, { marginTop: 8 }]}>{memoRun.context}</Text>}

        {summary && (
          <>
            <SectionTitle>Decision Summary</SectionTitle>
            <View style={styles.statGrid}>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Opportunity</Text>
                <Text style={styles.statValue}>{summary.commercialOpportunity}</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Confidence</Text>
                <Text style={styles.statValue}>{Number(summary.confidenceScore).toFixed(1)}/10</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Key Risks</Text>
                <Text style={styles.statValue}>{summary.keyRisksCount}</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Comp. Deals</Text>
                <Text style={styles.statValue}>{summary.comparableDealsFoundCount}</Text>
              </View>
            </View>
            <Text style={[styles.body, { marginTop: 8 }]}>
              Recommended next step: {NEXT_STEP_LABELS[summary.recommendedNextStep] ?? summary.recommendedNextStep}
            </Text>
            <Text style={[styles.subheading, { marginTop: 10 }]}>Confidence score breakdown</Text>
            <BarRow label="Clinical data" value={Number(summary.clinicalDataCompleteness)} max={1} color={COLORS.navy} />
            <BarRow label="Competitive" value={Number(summary.competitiveCoverageCompleteness)} max={1} color={COLORS.navy} />
            <BarRow label="Commercial" value={Number(summary.commercialSourceQuality)} max={1} color={COLORS.navy} />
            <BarRow label="Regulatory" value={Number(summary.regulatoryPrecedentStrength)} max={1} color={COLORS.navy} />
            <BarRow label="Critic (inv.)" value={Number(summary.inverseCriticFlagSeverity)} max={1} color={COLORS.navy} />
          </>
        )}

        <SectionTitle>Epistemic Ledger</SectionTitle>
        <Text style={styles.body}>How much of this assessment is known vs. inferred</Text>
        <View style={{ marginTop: 6 }}>
          {EPISTEMIC_LABELS.map((label) => (
            <BarRow
              key={label}
              label={label}
              value={epistemicLedger.counts[label]}
              max={epistemicMax}
              color={LABEL_COLORS[label]}
            />
          ))}
        </View>

        {clinical && (clinical.mechanismSummary || clinical.trials.length > 0) && (
          <>
            <SectionTitle>Clinical Landscape</SectionTitle>
            {clinical.mechanismSummary && (
              <View style={{ marginBottom: 8 }}>
                <View style={styles.row}>
                  <Text style={styles.subheading}>Mechanism of Action</Text>
                  {clinical.mechanismLabel && <ClaimTag label={clinical.mechanismLabel} />}
                </View>
                <Text style={styles.body}>{clinical.mechanismSummary}</Text>
              </View>
            )}
            {clinical.trials.map((trial) => (
              <View key={trial.id} style={styles.card} wrap={false}>
                <View style={styles.row}>
                  <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{trial.title}</Text>
                  <Tag text={trial.status} color={COLORS.navy} />
                </View>
                <Text style={styles.muted}>
                  {trial.nctId} · {trial.phase} · {trial.sponsor}
                  {trial.enrollment ? ` · n=${trial.enrollment}` : ""}
                  {trial.isStale ? " · status may be stale" : ""}
                </Text>
                {trial.primaryEndpoint && <Text style={styles.muted}>Endpoint: {trial.primaryEndpoint}</Text>}
                <CitationLine citation={trial.citation} />
              </View>
            ))}
            {clinical.safetySignals.map((signal) => (
              <View key={signal.id} style={styles.card} wrap={false}>
                <View style={styles.row}>
                  <Text style={styles.body}>{signal.description}</Text>
                  <ClaimTag label={signal.label} />
                </View>
                <CitationLine citation={signal.citation} />
              </View>
            ))}
          </>
        )}

        {competitive &&
          (competitive.approvedCompetitors.length > 0 ||
            competitive.lateStagePipelineAssets.length > 0 ||
            competitive.positioningGaps.length > 0) && (
            <>
              <SectionTitle>Competitive Landscape</SectionTitle>
              {competitive.approvedCompetitors.map((c) => (
                <View key={c.id} style={styles.card} wrap={false}>
                  <View style={styles.row}>
                    <View>
                      <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{c.drug}</Text>
                      <Text style={styles.muted}>{c.company} · {c.mechanism}</Text>
                    </View>
                    <Tag text={`Approved ${new Date(c.approvalDate).getFullYear()}`} color={COLORS.fact} />
                  </View>
                  <CitationLine citation={c.citation} />
                </View>
              ))}
              {competitive.lateStagePipelineAssets.map((a) => (
                <View key={a.id} style={styles.card} wrap={false}>
                  <View style={styles.row}>
                    <View>
                      <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{a.drug}</Text>
                      <Text style={styles.muted}>{a.company} · {a.mechanism}</Text>
                    </View>
                    <Tag text={`${a.phase} · ${a.status}`} color={COLORS.inference} />
                  </View>
                  <CitationLine citation={a.citation} />
                </View>
              ))}
              {competitive.positioningGaps.map((gap) => (
                <View key={gap.id} style={styles.card} wrap={false}>
                  <View style={styles.row}>
                    <Text style={styles.body}>{gap.description}</Text>
                    <ClaimTag label={gap.label} />
                  </View>
                </View>
              ))}
            </>
          )}

        {commercial &&
          (commercial.patientPopulationValue ||
            commercial.unmetNeedSummary ||
            commercial.marketCrowdingSummary ||
            commercial.differentiationSummary) && (
            <>
              <SectionTitle>Commercial Opportunity</SectionTitle>
              {commercial.patientPopulationValue && (
                <View style={{ marginBottom: 8 }}>
                  <View style={styles.row}>
                    <Text style={styles.subheading}>Patient Population Estimate</Text>
                    {commercial.patientPopulationLabel && <ClaimTag label={commercial.patientPopulationLabel} />}
                  </View>
                  <Text style={styles.body}>{commercial.patientPopulationValue}</Text>
                  <CitationLine citation={commercial.patientPopulationCitation} />
                </View>
              )}
              {commercial.unmetNeedSummary && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.subheading}>Unmet Need</Text>
                  <Text style={styles.body}>{commercial.unmetNeedSummary}</Text>
                </View>
              )}
              {commercial.marketCrowdingSummary && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.subheading}>Market Crowding</Text>
                  <Text style={styles.body}>{commercial.marketCrowdingSummary}</Text>
                </View>
              )}
              {commercial.differentiationSummary && (
                <View style={{ marginBottom: 8 }}>
                  <View style={styles.row}>
                    <Text style={styles.subheading}>Differentiation Potential</Text>
                    {commercial.differentiationLabel && <ClaimTag label={commercial.differentiationLabel} />}
                  </View>
                  <Text style={styles.body}>{commercial.differentiationSummary}</Text>
                </View>
              )}
            </>
          )}

        {dealComparables && (dealComparables.noCompFound || dealComparables.comparableDeals.length > 0) && (
          <>
            <SectionTitle>Deal Comparables</SectionTitle>
            {dealComparables.noCompFound ? (
              <Text style={styles.body}>
                No comparable deal found. {dealComparables.noCompExplanation}
              </Text>
            ) : (
              dealComparables.comparableDeals.map((deal) => (
                <View key={deal.id} style={styles.card} wrap={false}>
                  <View style={styles.row}>
                    <View>
                      <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{deal.asset}</Text>
                      <Text style={styles.muted}>
                        {deal.company} · {deal.stageAtDeal} · {deal.dealType}
                      </Text>
                    </View>
                    <Tag
                      text={deal.compStrength}
                      color={deal.compStrength === "Direct" ? COLORS.fact : COLORS.inference}
                    />
                  </View>
                  <Text style={[styles.body, { marginTop: 3 }]}>{deal.disclosedTerms}</Text>
                  <CitationLine citation={deal.citation} />
                </View>
              ))
            )}
          </>
        )}

        {regulatory &&
          (regulatory.developmentTimelineSummary ||
            regulatory.priorApprovals.length > 0 ||
            regulatory.endpointPrecedents.length > 0 ||
            regulatory.guidanceDocuments.length > 0) && (
            <>
              <SectionTitle>Regulatory Pathway</SectionTitle>
              {regulatory.developmentTimelineSummary && (
                <View style={{ marginBottom: 8 }}>
                  <View style={styles.row}>
                    <Text style={styles.subheading}>Development Timeline Estimate</Text>
                    {regulatory.developmentTimelineLabel && <ClaimTag label={regulatory.developmentTimelineLabel} />}
                  </View>
                  <Text style={styles.body}>{regulatory.developmentTimelineSummary}</Text>
                </View>
              )}
              {regulatory.priorApprovals.map((approval) => (
                <View key={approval.id} style={styles.card} wrap={false}>
                  <View style={styles.row}>
                    <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{approval.drug}</Text>
                    <Text style={styles.muted}>{new Date(approval.approvalDate).getFullYear()}</Text>
                  </View>
                  <CitationLine citation={approval.citation} />
                </View>
              ))}
              {regulatory.endpointPrecedents.map((precedent) => (
                <View key={precedent.id} style={styles.card} wrap={false}>
                  <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{precedent.endpoint}</Text>
                  <Text style={styles.muted}>Sourced from: {precedent.sourcedFromLabels.join(", ")}</Text>
                </View>
              ))}
              {regulatory.guidanceDocuments.map((doc) => (
                <View key={doc.id} style={styles.card} wrap={false}>
                  <Link src={doc.url} style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>
                    {doc.title}
                  </Link>
                  <Text style={styles.muted}>{doc.relevance}</Text>
                </View>
              ))}
            </>
          )}

        {patents && (patents.patentLandscapeSummary || patents.patents.length > 0) && (
          <>
            <SectionTitle>Patent Landscape</SectionTitle>
            {patents.patentLandscapeSummary && (
              <View style={{ marginBottom: 8 }}>
                <View style={styles.row}>
                  <Text style={styles.subheading}>Landscape Summary</Text>
                  {patents.patentLandscapeLabel && <ClaimTag label={patents.patentLandscapeLabel} />}
                </View>
                <Text style={styles.body}>{patents.patentLandscapeSummary}</Text>
              </View>
            )}
            {patents.patents.map((patent) => (
              <View key={patent.id} style={styles.card} wrap={false}>
                <View style={styles.row}>
                  <View>
                    <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{patent.title}</Text>
                    <Text style={styles.muted}>
                      {patent.patentNumber} · {patent.applicant}
                      {patent.publicationDate
                        ? ` · published ${new Date(patent.publicationDate).getFullYear()}`
                        : ""}
                    </Text>
                  </View>
                  <Tag
                    text={patent.status}
                    color={
                      patent.status === "Granted"
                        ? COLORS.fact
                        : patent.status === "Pending"
                          ? COLORS.inference
                          : COLORS.unknown
                    }
                  />
                </View>
                <View style={[styles.row, { marginTop: 3 }]}>
                  <Text style={styles.body}>{patent.relevance}</Text>
                  <ClaimTag label={patent.label} />
                </View>
                <CitationLine citation={patent.citation} />
              </View>
            ))}
          </>
        )}

        {keyRisksAndRecommendations && keyRisksAndRecommendations.keyRisks.length > 0 && (
          <>
            <SectionTitle>Key Risks</SectionTitle>
            {keyRisksAndRecommendations.keyRisks.map((risk) => (
              <View key={risk.id} style={styles.card} wrap={false}>
                <View style={styles.row}>
                  <Text style={styles.body}>{risk.description}</Text>
                  <ClaimTag label={risk.label} />
                </View>
                <CitationLine citation={risk.citation} />
              </View>
            ))}
          </>
        )}

        {keyRisksAndRecommendations && keyRisksAndRecommendations.routeRecommendations.length > 0 && (
          <>
            <SectionTitle>Preliminary Route Recommendations</SectionTitle>
            {keyRisksAndRecommendations.routeRecommendations.map((rec) => (
              <View key={rec.id} style={styles.card} wrap={false}>
                <View style={styles.row}>
                  <Text style={styles.body}>{rec.description}</Text>
                  <ClaimTag label={rec.label} />
                </View>
              </View>
            ))}
          </>
        )}

        {reviewerNotes && (reviewerNotes.reviewerNotesSummary || reviewerNotes.criticFlags.length > 0) && (
          <>
            <SectionTitle>Reviewer Notes</SectionTitle>
            {reviewerNotes.criticFlags.length === 0 ? (
              <Text style={styles.body}>{reviewerNotes.reviewerNotesSummary}</Text>
            ) : (
              reviewerNotes.criticFlags.map((flag) => (
                <View key={flag.id} style={styles.card} wrap={false}>
                  <View style={styles.row}>
                    <Text style={[styles.body, { fontWeight: 700, color: COLORS.navy }]}>{flag.section}</Text>
                    <Tag text={FLAG_TYPE_LABELS[flag.type] ?? flag.type} color={COLORS.amber} />
                  </View>
                  <Text style={styles.body}>{flag.description}</Text>
                </View>
              ))
            )}
          </>
        )}

        {sourceIndex.length > 0 && (
          <>
            <SectionTitle>Source Index ({sourceIndex.length})</SectionTitle>
            {sourceIndex.map((citation) => (
              <View key={citation.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }} wrap={false}>
                <Link src={citation.sourceUrl} style={[styles.muted, styles.link, { flex: 1, marginRight: 8 }]}>
                  {citation.sourceUrl}
                </Link>
                <Text style={styles.muted}>
                  {citation.sourceType} · accessed {citation.accessedDate.toISOString().slice(0, 10)}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `BioComm Copilot · Generated by AI agents from public sources — requires human review · Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
