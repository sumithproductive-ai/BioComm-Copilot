"use client";

import { FormEvent, useState } from "react";
import { createAssessment, type AssessmentResponse } from "@/lib/api";

const initialForm = {
  target: "IL-23 / p19 subunit",
  modality: "Monoclonal antibody",
  stage: "Phase 2",
  indication: "Ulcerative colitis",
  context: "",
};

export function TherapyProfileForm() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<AssessmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      setResult(await createAssessment(form));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="panel-header">
        <h2>Therapy Profile</h2>
        <span>Required fields</span>
      </div>

      <div className="field-grid">
        <label>
          Target
          <input
            value={form.target}
            onChange={(event) => setForm({ ...form, target: event.target.value })}
            required
          />
        </label>
        <label>
          Modality
          <input
            value={form.modality}
            onChange={(event) =>
              setForm({ ...form, modality: event.target.value })
            }
            required
          />
        </label>
        <label>
          Stage
          <input
            value={form.stage}
            onChange={(event) => setForm({ ...form, stage: event.target.value })}
            required
          />
        </label>
        <label>
          Indication
          <input
            value={form.indication}
            onChange={(event) =>
              setForm({ ...form, indication: event.target.value })
            }
            required
          />
        </label>
      </div>

      <label>
        Optional context
        <textarea
          value={form.context}
          onChange={(event) => setForm({ ...form, context: event.target.value })}
          placeholder="Company name, mechanism notes, asset background"
        />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Starting assessment..." : "Start assessment"}
      </button>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <section className="result">
          <h3>{result.decision_summary.recommended_next_step}</h3>
          <dl>
            <div>
              <dt>Opportunity</dt>
              <dd>{result.decision_summary.commercial_opportunity}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{result.decision_summary.confidence_score}/10</dd>
            </div>
            <div>
              <dt>Risks</dt>
              <dd>{result.decision_summary.key_risks_count}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </form>
  );
}
