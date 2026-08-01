# Backlog: BioComm Copilot

**Format:** User Stories
**Total stories:** 19 (1–14 are the original Demo Day backlog; 15–19 added post-Demo Day, see status note before Story 15)
**Persona coverage:** Maya (BD Analyst), David (Head of BD), Priya (CEO), Demo Day Judge

---

### Story 1: Submit a Therapy Profile
**As a BD analyst, I want to submit a therapy profile using four structured fields — target, modality, stage, and indication — so that I can initiate a full commercialization assessment without manually configuring each research domain.**

Acceptance Criteria:
- [ ] Form renders four required fields: Target, Modality, Stage, Indication
- [ ] Optional free-text field for additional context (company name, mechanism notes) is available
- [ ] Form validates all required fields before submission — empty fields produce a clear inline error
- [ ] Submitting a valid form triggers the Orchestrator Agent and navigates the user to a progress/results view
- [ ] Invalid or ambiguous input (e.g. unknown indication) surfaces a validation message before any agents run

Priority: P0 | Effort: S | Dependencies: none

---

### Story 2: See Real-Time Agent Progress
**As a BD analyst, I want to see which agent is currently running during memo generation so that I know the system is working and roughly how long it will take.**

Acceptance Criteria:
- [ ] Progress view displays the name and status of each agent: Queued / Running / Complete / Failed
- [ ] Active agent is visually distinguished from completed and pending agents
- [ ] If an agent fails and retries, the retry is reflected in the UI
- [ ] Estimated or elapsed time is displayed during processing
- [ ] User cannot submit a new request while one is in progress

Priority: P1 | Effort: S | Dependencies: Story 1

---

### Story 3: View the Decision Summary
**As a head of BD, I want a Decision Summary at the top of every memo so that I can assess whether an asset warrants further diligence in under 60 seconds without reading the full report.**

Acceptance Criteria:
- [ ] Decision Summary renders above the full memo with four fields: Commercial Opportunity (High/Medium/Low), Confidence Score (X.X/10), Key Risks count, Comparable Deals Found count
- [ ] Recommended Next Step is displayed: Continue diligence / Gather more data / Do not pursue
- [ ] Decision Summary is the first element visible on page load — no scrolling required
- [ ] Each field links or scrolls to its corresponding full memo section
- [ ] Confidence Score derivation method is documented and consistent across runs

Priority: P0 | Effort: M | Dependencies: Story 7 (Synthesis Agent)

---

### Story 4: Review the Clinical Landscape
**As a BD analyst, I want the clinical landscape section to include ClinicalTrials.gov trial IDs, PubMed references, and status dates for all referenced trials so that I can verify every claim without repeating the search myself.**

Acceptance Criteria:
- [ ] Every referenced trial includes a ClinicalTrials.gov NCT number
- [ ] Every efficacy or safety claim links to a PubMed paper or FDA label
- [ ] Trial status (Active / Completed / Terminated / Recruiting) reflects current ClinicalTrials.gov data with an access date
- [ ] If trial status cannot be confirmed as current, a staleness flag is shown
- [ ] Mechanism of action is summarized with at least one primary literature citation

Priority: P0 | Effort: L | Dependencies: Clinical Research Agent

---

### Story 5: Review the Competitive Landscape
**As a BD analyst, I want the competitive landscape section to map all approved UC therapies and late-stage pipeline assets so that I can confidently tell my VP no major competitor was missed.**

Acceptance Criteria:
- [ ] All FDA-approved UC therapies are present (vedolizumab, ustekinumab, anti-TNFs, JAK inhibitors, IL-23 inhibitors)
- [ ] Late-stage (Phase 2b+) pipeline assets in the same mechanism class are included
- [ ] Each competitor entry includes source, company, mechanism, and approval/trial status
- [ ] Critic Agent flags the section if a hardcoded major competitor is missing from the output
- [ ] Table format allows quick side-by-side comparison of mechanism and approval status

Priority: P0 | Effort: L | Dependencies: Competitive Intelligence Agent, Critic Agent

---

### Story 6: Review Deal Comparables
**As a CEO, I want the deal comparables section to show similar licensing and acquisition deals — or clearly state when none were found — so that I am not misled by fabricated or non-comparable transactions.**

Acceptance Criteria:
- [ ] Each comparable deal includes: asset type, stage at deal, deal structure (license/acquisition), disclosed financials if available, source (SEC filing or press release with URL)
- [ ] If financial terms are undisclosed, the entry states "terms not disclosed" — no estimated figure is inserted
- [ ] If no clean comparable is found, the section states this explicitly with a brief explanation
- [ ] Deals are clearly labeled if they are approximate comps vs. direct comps
- [ ] Critic Agent flags deals with no disclosed terms or weak comparability

Priority: P0 | Effort: L | Dependencies: Deal Comparables Agent, Critic Agent

---

### Story 7: Review the Regulatory Pathway
**As a CEO, I want the regulatory pathway section to outline the likely FDA development path and endpoint precedent from approved UC therapies so that I can have informed conversations with partners without hiring a consultant.**

Acceptance Criteria:
- [ ] Section references relevant FDA guidance documents with links
- [ ] Endpoint precedent (e.g. clinical remission, endoscopic improvement) is sourced from at least two approved UC therapy labels
- [ ] Likely development timeline is labeled as an estimate / assumption, not a fact
- [ ] Prior UC approvals in the same mechanism class are listed with approval dates and sources
- [ ] Regulatory claims use appropriately hedged language — no false certainty

Priority: P0 | Effort: M | Dependencies: Regulatory Agent

---

### Story 8: Review the Commercial Opportunity
**As a BD analyst, I want the commercial opportunity section to assess market size, unmet need, and the asset's differentiation potential so that I have a framed view of the addressable market before presenting internally.**

Acceptance Criteria:
- [ ] Patient population estimate is sourced (published literature or FDA label) and labeled as an estimate
- [ ] Unmet need is framed against current standard-of-care limitations with at least one citation
- [ ] Market crowding assessment references the competitive landscape section — no contradictions
- [ ] Differentiation potential is labeled as inference, not fact, unless directly sourced
- [ ] No market size figures are stated as precise facts without a credible published source

Priority: P0 | Effort: M | Dependencies: Commercial Opportunity Agent

---

### Story 9: See What the Critic Agent Flagged
**As a BD analyst, I want a dedicated Reviewer Notes section showing every flag the Critic Agent raised so that I know exactly what gaps remain before I use the memo externally.**

Acceptance Criteria:
- [ ] Reviewer Notes section appears after Key Risks and before the Source Index
- [ ] Each flag includes: type (unsupported claim / missing competitor / assumption-as-fact / no disclosed terms / outdated data / overconfident regulatory claim), location in memo, and brief description
- [ ] If no flags were raised, the section states "No critical flags identified — standard human review still required"
- [ ] Flags are not filtered or suppressed — all Critic Agent output is shown verbatim
- [ ] Section is visually distinct (e.g. bordered callout) so it is not confused with memo content

Priority: P0 | Effort: M | Dependencies: Critic Agent

---

### Story 10: Trust Every Claim Has a Source
**As a BD analyst, I want every material claim in the memo to carry a source, an access date, and a confidence label — Fact, Assumption, Inference, or Unknown — so that I do not mistake the system's interpretation for confirmed fact.**

Acceptance Criteria:
- [ ] All four label types (Fact / Assumption / Inference / Unknown) are rendered consistently throughout the memo
- [ ] Every labeled claim links to or references an entry in the Source Index
- [ ] No claim is presented without a label — missing labels are flagged by the Critic Agent
- [ ] Source Index at the bottom of the memo lists every citation with URL and access date
- [ ] As-of date is displayed at the top of each memo section

Priority: P0 | Effort: M | Dependencies: All research agents, Synthesis Agent

---

### Story 11: View the Full Memo in a Readable Format
**As a BD analyst, I want the full memo rendered as a structured, readable web page so that I can navigate sections easily and share a link with my VP for review.**

Acceptance Criteria:
- [ ] Memo renders all sections in order: Therapy Profile, Clinical Landscape, Competitive Landscape, Commercial Opportunity, Deal Comparables, Regulatory Pathway, Key Risks, Route Recommendations, Reviewer Notes, Source Index
- [ ] Section headers are anchor-linked — clicking a Decision Summary field scrolls to the relevant section
- [ ] Human review required disclaimer is prominently displayed at the top of the memo
- [ ] Memo is readable on desktop without horizontal scrolling
- [ ] Page title reflects the therapy profile submitted

Priority: P0 | Effort: M | Dependencies: Synthesis Agent, Story 3

---

### Story 12: Copy a Memo Section
**As a BD analyst, I want to copy individual memo sections to clipboard so that I can paste them directly into an existing PowerPoint or Word document without reformatting.**

Acceptance Criteria:
- [ ] Each memo section has a copy-to-clipboard button
- [ ] Copied text preserves plain text formatting — no HTML tags included
- [ ] Button shows a brief confirmation state after copy (e.g. "Copied")
- [ ] Source citations copy with the section text

Priority: P1 | Effort: S | Dependencies: Story 11

---

### Story 13: See Total Run Time on Completion
**As a BD analyst, I want to see the total time the system took to generate the memo so that I can document the time saved compared to manual research.**

Acceptance Criteria:
- [ ] Total elapsed time is displayed on the completed memo page
- [ ] Time is shown in minutes and seconds (e.g. "Generated in 14m 32s")
- [ ] Run time persists on the page — it does not disappear after load

Priority: P1 | Effort: S | Dependencies: Story 1, Story 11

---

### Story 14: Inspect Agent Traces in Langfuse
**As a Demo Day judge, I want to view Langfuse traces for a complete memo generation run so that I can verify that every agent call, tool use, and handoff is observable end-to-end.**

Acceptance Criteria:
- [ ] Every agent invocation creates a Langfuse trace with agent name, inputs, outputs, and duration
- [ ] Tool calls (web search, API fetches) are logged as child spans within the parent agent trace
- [ ] Orchestrator retries are captured as separate spans with retry count noted
- [ ] All traces for a single memo run are linked by a shared session ID
- [ ] Traces are viewable in the Langfuse dashboard without additional configuration

Priority: P0 | Effort: M | Dependencies: All agents

---

## Post-Demo Day additions (2026-08-01)

Stories 1–14 above are the original Demo Day backlog, delivered as written. Stories 15–19 below were added after Demo Day as new confirmed scope.

### Story 15: Review the Patent Landscape
**As a BD analyst, I want a Patent Landscape section citing real patents (composition-of-matter, method-of-use, blocking patents) so that I can factor freedom-to-operate risk into my assessment without a separate patent search.**

Acceptance Criteria:
- [x] Patent Landscape Agent (EPO Open Patent Services) runs as a 6th research agent, same tier as the original 5
- [x] Every patent finding carries a real citation, checked against a real search result this run
- [x] Kept informational only — never factored into the Confidence Score, so past/future scores stay comparable

Priority: P1 | Effort: L | Dependencies: EPO OPS credentials (live verification pending as of this writing)

---

### Story 16: Trust Citations Are Real, Not Just Well-Formed
**As a BD analyst, I want every citation to be checked against an actual search/tool result from that run, not just validated for shape, so that a well-formatted but fabricated URL can't slip through.**

Acceptance Criteria:
- [x] Every research agent tracks real hostnames seen from actual tool/web_search results during its run
- [x] A citation whose hostname never appeared in a real result is rejected before the agent's output is accepted
- [x] Verified with real runs and spot-checked citations against live sources, not just schema validation

Priority: P0 | Effort: M | Dependencies: All research agents

---

### Story 17: Cite the Primary Filing, Not Just News Coverage
**As a BD analyst, I want deal terms and competitor disclosures cited from the actual SEC filing where possible, so that I'm not relying on secondary news coverage for facts that have a primary source.**

Acceptance Criteria:
- [x] Deal Comparables and Competitive Intelligence can search SEC EDGAR's full-text search (no API key needed) and cite the real filing document
- [x] Verified live: a real run cited a real 10-Q, confirmed the filing URL resolves and the company matches

Priority: P1 | Effort: M | Dependencies: None (SEC EDGAR is public, no registration)

---

### Story 18: Get a Second Look on Flagged Findings
**As a BD analyst, I want the option to have Critic-flagged sections get a real second research pass before the memo is finalized, so that I can trade speed for accuracy when it matters.**

Acceptance Criteria:
- [x] Opt-in checkbox ("Deep Research Mode") on the Run Assessment screen and batch queue
- [x] Only agents Critic actually flagged get a second pass, fed the specific flag text
- [x] Critic re-reviews the corrected outputs before Synthesis runs
- [x] Verified live: a real run correctly re-ran only the flagged agents and skipped the rest

Priority: P1 | Effort: L | Dependencies: Critic Agent

---

### Story 19: Queue Multiple Assessments Without Babysitting Each One
**As a BD analyst evaluating several assets, I want to submit multiple therapy profiles at once and have them run automatically in the background, so that I don't have to manually trigger and monitor each one.**

Acceptance Criteria:
- [x] `/batch` page accepts multiple therapy profiles in one submission
- [x] Runs are concurrency-limited (2 at a time) and share capacity fairly with the single manual "Run Assessment" button
- [x] Each run shows correctly as Queued until it actually starts, not the moment it's submitted
- [x] Verified live: real batch submission, confirmed concurrency cap via timing, watched a real run complete end-to-end

Priority: P1 | Effort: M | Dependencies: None

---

## Story Map

| Must-Have (P0) | Should-Have (P1) |
|---|---|
| Submit Therapy Profile | Real-Time Agent Progress |
| Decision Summary | Copy Memo Section |
| Clinical Landscape | Total Run Time |
| Competitive Landscape | |
| Deal Comparables | |
| Regulatory Pathway | |
| Commercial Opportunity | |
| Critic Agent / Reviewer Notes | |
| Confidence Labels + Source Index | |
| Full Memo Render | |
| Langfuse Traces | |

---

## Technical Notes

- Orchestrator Agent must coordinate agent execution order and pass typed output schemas — all agents must agree on schema contracts before Synthesis Agent is built
- Critic Agent depends on finalized output schemas from all five research agents — build last among agents
- Confidence Score calculation method (rule-based vs. LLM-generated) must be decided before Story 3 is implemented
- Langfuse session linking (Story 14) requires session ID to be generated at Orchestrator level and passed down to all child agents

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| How is Confidence Score calculated — rule-based or LLM-scored? | Engineering + Product | Yes — blocks Story 3 |
| What is the hardcoded list of "major UC competitors" the Critic Agent checks against? | Product | Yes — blocks Story 5 |
| How should the system behave when an agent times out — surface partial memo or fail the run? | Engineering | Yes — blocks Story 2 |
| Should the Langfuse dashboard link be surfaced in the UI for Demo Day, or only accessible externally? | Product | No |
