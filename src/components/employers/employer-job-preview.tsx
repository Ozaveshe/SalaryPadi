"use client";

import { useState } from "react";

import {
  buildEmployerJobPreview,
  type EmployerJobPreviewData,
} from "@/lib/employers/job-preview";

export function EmployerJobPreview({ formId }: { formId: string }) {
  const [preview, setPreview] = useState<EmployerJobPreviewData | null>(null);

  function showPreview() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.reportValidity()) return;
    setPreview(buildEmployerJobPreview(new FormData(form)));
  }

  return (
    <section
      className="surface surface-pad stack-lg"
      aria-labelledby="job-preview-heading"
    >
      <div className="stack">
        <h2 className="section-title" id="job-preview-heading">
          Preview before moderation
        </h2>
        <p className="text-muted m-0">
          Preview exactly what you entered before submitting. Previewing does
          not save, publish or send the vacancy.
        </p>
      </div>
      <button
        className="button button-secondary w-fit"
        onClick={showPreview}
        type="button"
      >
        Preview this vacancy
      </button>
      {preview ? (
        <article className="job-preview stack" aria-live="polite">
          <header className="stack-sm">
            <p className="eyebrow">Private preview · not published</p>
            <h3 className="section-title">{preview.title}</h3>
            <p className="m-0">
              <strong>{preview.companyName}</strong> · {preview.location}
            </p>
            <p className="text-muted m-0">
              {preview.workMode} · {preview.employmentType} ·{" "}
              {preview.experienceLevel}
            </p>
          </header>
          <div className="notice">
            <strong>Eligibility submitted for review:</strong>{" "}
            {preview.eligibilityScope}. {preview.eligibilityEvidence}
          </div>
          <div className="stack-sm">
            <h4>Description</h4>
            <p className="preserve-lines m-0">{preview.description}</p>
          </div>
          <div className="stack-sm">
            <h4>Qualifications and requirements</h4>
            <p className="preserve-lines m-0">{preview.requirements}</p>
          </div>
          {preview.benefits ? (
            <div className="stack-sm">
              <h4>Benefits and pay practices</h4>
              <p className="preserve-lines m-0">{preview.benefits}</p>
            </div>
          ) : null}
          <dl className="quick-facts">
            <div>
              <dt>Pay</dt>
              <dd>{preview.salary ?? "Not disclosed"}</dd>
            </div>
            <div>
              <dt>Apply at</dt>
              <dd>{preview.applicationHost}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>{preview.deadline ?? "Not stated"}</dd>
            </div>
          </dl>
        </article>
      ) : null}
    </section>
  );
}
