"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

type Screen = "input" | "progress" | "memo";
type Tag = "FACT" | "INFERENCE" | "ASSUMPTION" | "UNKNOWN";

const sectionMeta = [
  ["decision-summary", "decisionSummary", "01", "Decision Summary"],
  ["epistemic-ledger", "epistemicLedger", "02", "Epistemic Ledger"],
  ["clinical-context", "clinicalContext", "03", "Clinical & Mechanistic Context"],
  ["competitive", "competitive", "04", "Competitive Landscape"],
  ["regulatory", "regulatory", "05", "Regulatory Pathway"],
  ["comparable-deals", "comparableDeals", "06", "Comparable Deals"],
  ["rnpv", "rnpv", "07", "rNPV Scaffold"],
  ["open-questions", "openQuestions", "08", "Open Questions & Owner Map"],
  ["risk-flags", "riskFlags", "09", "Irreversible Risk Flags"],
] as const;

const agents = [
  ["Clinical Evidence Agent", "complete"],
  ["Competitive Landscape Agent", "complete"],
  ["Regulatory Pathway Agent", "complete"],
  ["Deal Comparables Agent", "blocked"],
  ["Valuation Scaffold Agent", "running"],
  ["Risk Flag Agent", "queued"],
  ["Synthesis Agent", "queued"],
] as const;

const competitors = [
  ["Infliximab (Remicade)", "Anti-TNF", "Approved"],
  ["Adalimumab (Humira)", "Anti-TNF", "Approved"],
  ["Vedolizumab (Entyvio)", "Anti-integrin", "Approved"],
  ["Ustekinumab (Stelara)", "IL-23 pathway", "Approved"],
  ["Mirikizumab (Omvoh)", "IL-23 pathway", "Approved"],
  ["Tofacitinib (Xeljanz)", "Oral small molecule", "Boxed Warning"],
  ["Etrasimod (Velsipity)", "Oral small molecule", "Approved"],
] as const;

const deals = [
  ["tulisokibart (PRA023) · anti-TL1A", "Merck ← Prometheus Bio", "$10.8B", "2023", "FACT"],
  ["RVT-3101 · anti-TL1A", "Roche ← Telavant (Roivant)", "$7.1B", "2023", "FACT"],
  ["alpha4beta7 integrin portfolio", "Eli Lilly ← Morphic", "$3.2B", "2024", "FACT"],
  ["duvakitug (TEV-48574) · anti-TL1A", "Sanofi x Teva partnership", "<= $1.5B*", "2023", "INFERENCE"],
] as const;

const rnpv = [
  ["Phase II Success Probability", "45-55%", "Class-adjusted; single Ph II asset", "INFERENCE"],
  ["Peak Sales (annual, US + EU)", "$400M - $900M", "Wide band - mechanism uncertainty", "ASSUMPTION"],
  ["Discount Rate", "10%", "Standard early-clinical biotech", "ASSUMPTION"],
  ["Time to Market", "7-10 yrs", "From Phase II completion", "INFERENCE"],
] as const;

const openQuestions = [
  ["01", "Phase II primary endpoint met?", "No public data disclosed", "Clinical Diligence", "UNKNOWN"],
  ["02", "Payer coverage precedent for TL1A class", "No approved comparator to anchor access", "Market Access", ""],
  ["03", "CMC scalability for IgG1 format", "Titer and cost-of-goods at commercial scale", "Technical Operations", ""],
] as const;

const risks = [
  [
    "Competitor Merck MK-1654 (anti-TL1A) in Phase 3 - results expected Q4 2026.",
    "A positive readout compresses first-in-class positioning into fast-follower.",
    "FACT",
  ],
  [
    "No approved TL1A agent anywhere means no reimbursement precedent.",
    "Access, pricing, and coding pathways are unmodeled and unproven.",
    "UNKNOWN",
  ],
] as const;

export function BioCommPrototype() {
  const [screen, setScreen] = useState<Screen>("input");
  const [target, setTarget] = useState("TL1A");
  const [modality, setModality] = useState("Monoclonal Antibody");
  const [stage, setStage] = useState("Phase II");
  const [indication, setIndication] = useState("Moderate-to-Severe Ulcerative Colitis");
  const [context, setContext] = useState("Novel mechanism - not IL-23 class");
  const [activeSection, setActiveSection] = useState("decision-summary");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const scrollport = useRef<HTMLDivElement>(null);

  const descriptor = `${target} mAb · ${stage} · ${shortIndication(indication)}`;
  const memoTitle = `${target} · ${indication}`;
  const metaLine = `${modality} · ${stage} · Generated 04 Jul 2026 · 7 agents`;

  const update = (setter: (value: string) => void) => {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setter(event.target.value);
  };

  function goMemo() {
    setScreen("memo");
    setActiveSection("decision-summary");
  }

  function scrollToSection(id: string) {
    setActiveSection(id);
    const el = scrollport.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (el && scrollport.current) {
      scrollport.current.scrollTo({ top: el.offsetTop - 14, behavior: "smooth" });
    }
  }

  function toggle(key: string) {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  }

  const sectionState = useMemo(
    () =>
      sectionMeta.map(([id, key, num, label]) => ({
        id,
        key,
        num,
        label,
        open: !collapsed[key],
        active: activeSection === id,
      })),
    [activeSection, collapsed],
  );

  return (
    <main className="prototype-root">
      {screen === "input" ? (
        <InputScreen
          target={target}
          modality={modality}
          stage={stage}
          indication={indication}
          context={context}
          onTarget={update(setTarget)}
          onModality={update(setModality)}
          onStage={update(setStage)}
          onIndication={update(setIndication)}
          onContext={update(setContext)}
          onGenerate={() => setScreen("progress")}
          onHome={() => setScreen("input")}
        />
      ) : null}

      {screen === "progress" ? (
        <ProgressScreen
          descriptor={descriptor}
          onHome={() => setScreen("input")}
          onMemo={goMemo}
        />
      ) : null}

      {screen === "memo" ? (
        <MemoScreen
          descriptor={descriptor}
          memoTitle={memoTitle}
          metaLine={metaLine}
          sections={sectionState}
          onHome={() => setScreen("input")}
          onNav={scrollToSection}
          onToggle={toggle}
          scrollport={scrollport}
        />
      ) : null}
    </main>
  );
}

function Header({
  descriptor,
  action,
  onHome,
}: {
  descriptor?: string;
  action?: React.ReactNode;
  onHome: () => void;
}) {
  return (
    <div className="topbar">
      <button className="brand" type="button" onClick={onHome}>
        <span className="brand-mark" />
        <span className="brand-name">
          <strong>BioComm</strong> <span>Copilot</span>
        </span>
      </button>
      {descriptor ? (
        <div className="asset-chip">
          <span className="mini-diamond" />
          <span>{descriptor}</span>
        </div>
      ) : null}
      <div className="topbar-spacer" />
      {action}
    </div>
  );
}

function InputScreen(props: {
  target: string;
  modality: string;
  stage: string;
  indication: string;
  context: string;
  onTarget: (event: ChangeEvent<HTMLInputElement>) => void;
  onModality: (event: ChangeEvent<HTMLSelectElement>) => void;
  onStage: (event: ChangeEvent<HTMLSelectElement>) => void;
  onIndication: (event: ChangeEvent<HTMLInputElement>) => void;
  onContext: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onGenerate: () => void;
  onHome: () => void;
}) {
  return (
    <div className="screen input-screen">
      <Header onHome={props.onHome} />
      <section className="input-wrap">
        <div className="input-stack">
          <p className="eyebrow">New Assessment</p>
          <h1>New Commercialization Assessment</h1>
          <p className="subcopy">
            Enter a therapeutic asset. Specialized agents will research and assemble a source-cited
            intelligence memo.
          </p>

          <div className="prototype-card input-card">
            <label className="field">
              <span>Target</span>
              <input value={props.target} onChange={props.onTarget} placeholder="e.g. TL1A" />
            </label>

            <div className="two-col">
              <label className="field select-field">
                <span>Modality</span>
                <select value={props.modality} onChange={props.onModality}>
                  <option>Monoclonal Antibody</option>
                  <option>Small Molecule</option>
                  <option>Cell Therapy</option>
                  <option>Gene Therapy</option>
                  <option>Bispecific</option>
                  <option>Peptide</option>
                  <option>RNA Therapeutic</option>
                </select>
              </label>
              <label className="field select-field">
                <span>Stage</span>
                <select value={props.stage} onChange={props.onStage}>
                  <option>Discovery</option>
                  <option>Preclinical</option>
                  <option>Phase I</option>
                  <option>Phase II</option>
                  <option>Phase III</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Indication</span>
              <input
                value={props.indication}
                onChange={props.onIndication}
                placeholder="e.g. Moderate-to-Severe Ulcerative Colitis"
              />
            </label>

            <label className="field">
              <span>
                Additional Context <em>- optional</em>
              </span>
              <textarea
                value={props.context}
                onChange={props.onContext}
                rows={2}
                placeholder="Anything the agents should weigh..."
              />
            </label>

            <button className="primary-action" type="button" onClick={props.onGenerate}>
              Generate Assessment <span>→</span>
            </button>
          </div>

          <p className="live-note">
            <span /> Runs in real time - findings appear as each agent completes.
          </p>
          <AgentChips />
        </div>
      </section>
    </div>
  );
}

function AgentChips() {
  return (
    <div className="agent-chip-row">
      <span>7 agents deploy</span>
      {["Clinical Evidence", "Competitive", "Regulatory", "Deals", "Valuation", "Risk", "Critic ⛔"].map(
        (label) => (
          <small key={label}>{label}</small>
        ),
      )}
    </div>
  );
}

function ProgressScreen({
  descriptor,
  onHome,
  onMemo,
}: {
  descriptor: string;
  onHome: () => void;
  onMemo: () => void;
}) {
  return (
    <div className="screen progress-screen">
      <Header
        descriptor={descriptor}
        onHome={onHome}
        action={
          <>
            <div className="elapsed">
              <span /> Elapsed 4m 32s
            </div>
            <button className="topbar-action" type="button" onClick={onMemo}>
              Skip to completed memo →
            </button>
          </>
        }
      />
      <section className="progress-grid">
        <div className="prototype-card pipeline-card">
          <div className="card-heading">
            <h2>Agent Pipeline</h2>
            <span>3 / 7 complete</span>
          </div>
          <div className="progress-bar">
            <span />
          </div>
          <div className="agent-list">
            {agents.map(([name, status]) => (
              <div className="agent-row" key={name}>
                <StatusIcon status={status} />
                <span className={`agent-name ${status}`}>{name}</span>
                <span className={`status-pill ${status}`}>{statusLabel(status)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="prototype-card feed-card">
          <div className="card-heading">
            <h2>Research Feed</h2>
            <span className="streaming"><i /> Streaming</span>
          </div>
          <FeedItem time="04:29" agent="Clinical Evidence Agent">
            Identified 3 active NCT records for TL1A-pathway agents in UC. TULIP-1 and TULIP-2
            precedent trials logged.
          </FeedItem>
          <FeedItem time="04:30" agent="Competitive Landscape Agent">
            Mapped 7 approved / late-stage UC therapies across 4 mechanism classes. No approved
            agent in TL1A class.
          </FeedItem>
          <div className="critic-block">
            <div className="critic-head">
              <strong>⛔ Critic: Claim Blocked</strong>
              <span>04:31</span>
            </div>
            <dl>
              <dt>Source</dt>
              <dd>Clinical Evidence Agent</dd>
              <dt>Claim</dt>
              <dd>&quot;demonstrated efficacy in 12-week remission rate vs. placebo...&quot;</dd>
              <dt>Reason</dt>
              <dd>No source citation attached. Requires PubMed ID or ClinicalTrials.gov NCT number.</dd>
              <dt>Status</dt>
              <dd><i /> Agent re-querying. Revised output pending.</dd>
            </dl>
            <p>Quality gate enforced - unsourced claims are held, not published.</p>
          </div>
          <FeedItem time="04:32" agent="Regulatory Pathway Agent">
            BLA pathway confirmed; no TL1A-class precedent approval on file. Fast Track eligibility
            flagged for review.
          </FeedItem>
          <FeedItem time="04:33" agent="Valuation Scaffold Agent · running" running>
            Assembling rNPV input ranges. Applying mechanism-uncertainty discount to peak-sales band...
          </FeedItem>
        </div>
      </section>
    </div>
  );
}

function MemoScreen({
  descriptor,
  memoTitle,
  metaLine,
  sections,
  onHome,
  onNav,
  onToggle,
  scrollport,
}: {
  descriptor: string;
  memoTitle: string;
  metaLine: string;
  sections: Array<{ id: string; key: string; num: string; label: string; active: boolean; open: boolean }>;
  onHome: () => void;
  onNav: (id: string) => void;
  onToggle: (key: string) => void;
  scrollport: React.RefObject<HTMLDivElement | null>;
}) {
  const open = Object.fromEntries(sections.map((section) => [section.key, section.open]));

  return (
    <div className="memo-screen">
      <Header
        descriptor={descriptor}
        onHome={onHome}
        action={<button className="secondary-action" type="button">↧ Export PDF</button>}
      />
      <div className="memo-body">
        <aside className="memo-sidebar">
          <p>Memo Contents</p>
          {sections.map((section) => (
            <button
              className={`memo-nav ${section.active ? "active" : ""}`}
              key={section.id}
              type="button"
              onClick={() => onNav(section.id)}
            >
              <span>{section.num}</span>
              <strong>{section.label}</strong>
            </button>
          ))}
          <div className="epistemic-key">
            <p>Epistemic key</p>
            <KeyItem color="green" label="Fact" />
            <KeyItem color="blue" label="Inference" />
            <KeyItem color="orange" label="Assumption" />
            <KeyItem color="gray" label="Unknown" />
          </div>
        </aside>

        <div className="memo-scroll" ref={scrollport}>
          <article className="memo-document">
            <header className="memo-title">
              <p>Commercialization Intelligence Memo</p>
              <h1>{memoTitle}</h1>
              <span>{metaLine}</span>
            </header>

            <section className="decision-card" data-sec="decision-summary">
              <div className="decision-head">
                <div>
                  <span>01</span>
                  <h2>Decision Summary</h2>
                </div>
                <strong><i /> Moderate Confidence</strong>
              </div>
              <p>
                TL1A represents a validated but early UC mechanism with one approved agent in a
                related pathway. Phase II data for this asset is not yet publicly available. Overall
                signal: <b>MODERATE</b>. Proceed to primary diligence - competitive positioning and
                endpoint precedent are the key open questions.
              </p>
              <div className="signal-row">
                <span>Overall signal</span>
                <div><i /><i className="active" /><i /></div>
                <strong>Moderate</strong>
              </div>
            </section>

            <section className="ledger-card" data-sec="epistemic-ledger">
              <div className="ledger-strip"><i /><i /><i /><i /></div>
              <div className="ledger-head">
                <div>
                  <span>02</span>
                  <div>
                    <h2>Epistemic Ledger</h2>
                    <p>How much of this memo is known vs. inferred</p>
                  </div>
                </div>
                <strong>Core method</strong>
              </div>
              <LedgerRows />
              <div className="sample-claims">
                <p>Sample tagged claims</p>
                <Claim tag="FACT">NCT03398148 (LUCENT-1) Phase 3 completed - source: ClinicalTrials.gov</Claim>
                <Claim tag="INFERENCE">Market likely exceeds $4B by 2028 based on approved class trajectory</Claim>
                <Claim tag="ASSUMPTION">Peak sales modeled at $800M; no validated comp for this exact mechanism</Claim>
                <Claim tag="UNKNOWN">No public data on payer coverage precedent for this mechanism class</Claim>
              </div>
            </section>

            <MemoSection
              id="clinical-context"
              num="03"
              title="Clinical & Mechanistic Context"
              open={open.clinicalContext}
              onToggle={() => onToggle("clinicalContext")}
            >
              <Claim tag="INFERENCE">TL1A engages a distinct inflammatory and pro-fibrotic axis from the IL-23 pathway, supporting a differentiated-mechanism claim.</Claim>
              <Claim tag="FACT">Precedent Phase II/III programs established the moderate-to-severe UC endpoint and safety benchmarks this asset will be read against.</Claim>
              <Claim tag="ASSUMPTION">Anti-fibrotic benefit observed preclinically is assumed translatable to clinical remission; not yet demonstrated for this asset.</Claim>
              <div className="nct-row">
                <span>3 active NCT records</span>
                <code>NCT05013905</code>
                <code>NCT06052059</code>
                <code>NCT04996641</code>
              </div>
            </MemoSection>

            <MemoSection
              id="competitive"
              num="04"
              title="Competitive Landscape"
              open={open.competitive}
              onToggle={() => onToggle("competitive")}
            >
              <CompetitorTable />
              <div className="note-box">
                <h3>Differentiation Opportunities</h3>
                <Claim tag="FACT">No approved agent in the TL1A mechanism class as of 2026.</Claim>
                <Claim tag="INFERENCE">Oral small-molecule competitors face black box warnings - creates a durability / safety positioning window for biologics.</Claim>
              </div>
            </MemoSection>

            <MemoSection
              id="regulatory"
              num="05"
              title="Regulatory Pathway"
              open={open.regulatory}
              onToggle={() => onToggle("regulatory")}
            >
              <Claim tag="FACT">Standard BLA (351(a)) pathway applies for an IgG1 monoclonal antibody; no TL1A-class product has been approved.</Claim>
              <Claim tag="ASSUMPTION">Fast Track eligibility is plausible given UC&apos;s remaining unmet need but is not yet requested or granted.</Claim>
            </MemoSection>

            <MemoSection
              id="comparable-deals"
              num="06"
              title="Comparable Deals"
              open={open.comparableDeals}
              onToggle={() => onToggle("comparableDeals")}
            >
              <DealsTable />
              <p className="table-note">* Milestone-inclusive ceiling; upfront undisclosed - value modeled, not public.</p>
            </MemoSection>

            <MemoSection
              id="rnpv"
              num="07"
              title="rNPV Scaffold"
              open={open.rnpv}
              onToggle={() => onToggle("rnpv")}
            >
              <div className="rnpv-grid">
                {rnpv.map(([label, value, note, tag]) => (
                  <div className="rnpv-card" key={label}>
                    <div>
                      <span>{label}</span>
                      <TagBadge tag={tag as Tag} />
                    </div>
                    <strong>{value}</strong>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              <div className="guardrail">
                <span>Shield</span>
                <div>
                  <h3>By design - not a limitation</h3>
                  <p>BioComm does not produce a single valuation number. This scaffold shows labeled inputs and a range. A qualified analyst must review all assumptions before external use.</p>
                </div>
              </div>
            </MemoSection>

            <MemoSection
              id="open-questions"
              num="08"
              title="Open Questions & Owner Map"
              open={open.openQuestions}
              onToggle={() => onToggle("openQuestions")}
            >
              <div className="question-list">
                {openQuestions.map(([num, question, note, owner, tag]) => (
                  <div className="question-row" key={num}>
                    <span>{num}</span>
                    <div>
                      <h3>{question} {tag ? <TagBadge tag={tag as Tag} /> : null}</h3>
                      <p>{note}</p>
                    </div>
                    <aside>
                      <small>Owner</small>
                      <strong>{owner}</strong>
                    </aside>
                  </div>
                ))}
              </div>
            </MemoSection>

            <MemoSection
              id="risk-flags"
              num="09"
              title="Irreversible Risk Flags"
              open={open.riskFlags}
              onToggle={() => onToggle("riskFlags")}
            >
              {risks.map(([text, sub, tag]) => (
                <div className="risk-row" key={text}>
                  <span>▲</span>
                  <div>
                    <h3>{text} <TagBadge tag={tag as Tag} /></h3>
                    <p>{sub}</p>
                  </div>
                </div>
              ))}
            </MemoSection>

            <footer className="memo-footer">
              <span>Generated by BioComm Copilot · source-cited · analyst review required before external use.</span>
              <button className="secondary-action" type="button">↧ Export PDF</button>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}

function MemoSection({
  id,
  num,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  num: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="memo-section" data-sec={id}>
      <button className="section-toggle" type="button" onClick={onToggle}>
        <span>{num}</span>
        <h2>{title}</h2>
        <i className={open ? "open" : ""}>▸</i>
      </button>
      {open ? <div className="section-content">{children}</div> : null}
    </section>
  );
}

function FeedItem({
  time,
  agent,
  running,
  children,
}: {
  time: string;
  agent: string;
  running?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`feed-item ${running ? "running" : ""}`}>
      <span>{time}</span>
      <div>
        <strong><i /> {agent}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: (typeof agents)[number][1] }) {
  if (status === "complete") return <span className="status-icon complete">✓</span>;
  if (status === "running") return <span className="status-icon running"><i /></span>;
  if (status === "blocked") return <span className="status-icon blocked">!</span>;
  return <span className="status-icon queued" />;
}

function LedgerRows() {
  const rows = [
    ["FACT", 14, "green", "100%"],
    ["INFERENCE", 9, "blue", "64%"],
    ["ASSUMPTION", 6, "orange", "43%"],
    ["UNKNOWN", 4, "gray", "29%"],
  ] as const;
  return (
    <div className="ledger-rows">
      {rows.map(([label, count, color, width]) => (
        <div className="ledger-row" key={label}>
          <span><i className={color} /> {label}</span>
          <strong>{count}</strong>
          <div><i className={color} style={{ width }} /></div>
        </div>
      ))}
    </div>
  );
}

function CompetitorTable() {
  return (
    <div className="data-table competitor-table">
      <div className="table-head"><span>Therapy</span><span>Mechanism Class</span><span>Status</span></div>
      {competitors.map(([name, cls, status]) => (
        <div className="table-row" key={name}>
          <strong>{name}</strong>
          <span><Chip label={cls} /></span>
          <span><Chip label={status} /></span>
        </div>
      ))}
    </div>
  );
}

function DealsTable() {
  return (
    <div className="data-table deals-table">
      <div className="table-head"><span>Asset / Mechanism</span><span>Counterparty</span><span>Value</span><span>Year</span><span>Tag</span></div>
      {deals.map(([asset, party, value, year, tag]) => (
        <div className="table-row" key={asset}>
          <strong>{asset}</strong>
          <span>{party}</span>
          <b>{value}</b>
          <span>{year}</span>
          <span><TagBadge tag={tag as Tag} /></span>
        </div>
      ))}
    </div>
  );
}

function Claim({ tag, children }: { tag: Tag; children: React.ReactNode }) {
  return (
    <p className="claim">
      <TagBadge tag={tag} />
      <span>{children}</span>
    </p>
  );
}

function TagBadge({ tag }: { tag: Tag }) {
  return <span className={`tag ${tag.toLowerCase()}`}>{tag}</span>;
}

function Chip({ label }: { label: string }) {
  const key = label.toLowerCase().replace(/\s+/g, "-");
  return <span className={`chip ${key}`}>{label}</span>;
}

function KeyItem({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i className={color} /> {label}
    </span>
  );
}

function statusLabel(status: string) {
  return status[0].toUpperCase() + status.slice(1);
}

function shortIndication(indication: string) {
  return (
    indication
      .replace(
        /^\s*(moderate[-\s]to[-\s]severe|mild[-\s]to[-\s]moderate|moderately[-\s]to[-\s]severely[-\s]active|moderate|severe|mild|active)\s+/i,
        "",
      )
      .trim() || indication
  );
}
