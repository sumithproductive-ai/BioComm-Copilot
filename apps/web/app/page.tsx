import { TherapyProfileForm } from "@/components/therapy-profile-form";

const workflowSteps = [
  "Input validation",
  "Clinical research",
  "Competitive intelligence",
  "Commercial opportunity",
  "Deal comparables",
  "Regulatory pathway",
  "Critic review",
  "Memo synthesis",
];

export default function Home() {
  return (
    <main className="shell">
      <section className="workbench">
        <div className="panel intro">
          <p className="eyebrow">Commercialization Intelligence</p>
          <h1>BioComm Copilot</h1>
          <p className="lede">
            Generate a first-pass UC therapy assessment with source-cited agent
            outputs, reviewer notes, and a decision summary.
          </p>
        </div>

        <TherapyProfileForm />

        <div className="panel">
          <div className="panel-header">
            <h2>Agent Workflow</h2>
            <span>PoC v1</span>
          </div>
          <ol className="timeline">
            {workflowSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
