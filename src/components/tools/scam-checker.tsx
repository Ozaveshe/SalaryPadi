"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, ShieldAlert } from "lucide-react";

import { type ScamCheckResult, type ScamStructuredAnswers } from "@/lib/scam";

function optional(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

export function ScamChecker() {
  const [result, setResult] = useState<ScamCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProviderNotice(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const answers: ScamStructuredAnswers = {
      employerName: optional(form, "employer_name"),
      recruiterEmail: optional(form, "recruiter_email"),
      officialEmployerDomain: optional(form, "official_domain"),
      applicationUrl: optional(form, "application_url"),
      feeRequested: form.get("fee_requested") === "on",
      feePurpose:
        form.get("fee_requested") === "on"
          ? (String(
              form.get("fee_purpose"),
            ) as ScamStructuredAnswers["feePurpose"])
          : undefined,
      interviewChannel: String(
        form.get("interview_channel"),
      ) as ScamStructuredAnswers["interviewChannel"],
      compensationSeemsUnrealistic:
        form.get("unrealistic_compensation") === "on",
      employerIdentityIsClear:
        form.get("employer_unclear") === "on" ? false : undefined,
      offerMadeWithoutAssessment: form.get("instant_offer") === "on",
      bankingCredentialsRequested: form.get("banking_requested") === "on",
      unnecessaryIdentityDocumentsRequested:
        form.get("identity_requested") === "on",
      cryptocurrencyRequested: form.get("crypto_requested") === "on",
      pressureOrUrgency: form.get("urgency") === "on",
      domainAppearsMisspelled: form.get("domain_misspelled") === "on",
      applicationLinkRelatedToEmployer:
        form.get("link_unrelated") === "on" ? false : undefined,
    };
    try {
      const response = await fetch("/api/tools/job-scam-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          input: { vacancyText: optional(form, "vacancy_text"), answers },
        }),
      });
      const body = (await response.json()) as {
        result?: ScamCheckResult;
        error?: string;
        notice?: string;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error || "The warning-sign check could not run.");
      }
      setResult(body.result);
      setProviderNotice(body.notice ?? null);
    } catch (reason) {
      setResult(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "The warning-sign check could not run.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="tool-workspace">
      <form className="contribution-form" onSubmit={submit}>
        <fieldset>
          <legend>Vacancy text</legend>
          <div className="field">
            <label htmlFor="vacancy_text">
              Paste the vacancy or recruiter message
            </label>
            <textarea
              className="textarea scam-text"
              id="vacancy_text"
              name="vacancy_text"
              maxLength={20000}
              placeholder="Paste text here. Remove names or details that are not needed for the check."
            />
            <p className="field-help">
              Submitted text is processed by SalaryPadi&apos;s deterministic
              checker. Supplied links are parsed but never opened, fetched or
              sent to a third party.
            </p>
          </div>
        </fieldset>
        <fieldset>
          <legend>Employer and links</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="employer_name">Employer name</label>
              <input
                className="input"
                id="employer_name"
                name="employer_name"
              />
            </div>
            <div className="field">
              <label htmlFor="recruiter_email">Recruiter email</label>
              <input
                className="input"
                id="recruiter_email"
                name="recruiter_email"
                type="email"
              />
            </div>
            <div className="field">
              <label htmlFor="official_domain">Official employer domain</label>
              <input
                className="input"
                id="official_domain"
                name="official_domain"
                placeholder="example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="application_url">Application URL</label>
              <input
                className="input"
                id="application_url"
                name="application_url"
                type="url"
              />
            </div>
            <div className="field">
              <label htmlFor="interview_channel">Interview channel</label>
              <select
                className="select"
                id="interview_channel"
                name="interview_channel"
              >
                <option value="unknown">Unknown</option>
                <option value="video_or_phone">Video or phone</option>
                <option value="in_person">In person</option>
                <option value="messaging_only">Messaging only</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fee_purpose">Fee purpose (if requested)</label>
              <select className="select" id="fee_purpose" name="fee_purpose">
                <option value="application">Application</option>
                <option value="training">Training</option>
                <option value="equipment">Equipment</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>What happened?</legend>
          <div className="checkbox-grid">
            {[
              ["fee_requested", "A payment or fee was requested"],
              ["unrealistic_compensation", "I believe the pay is unrealistic"],
              ["employer_unclear", "The employer identity is unclear"],
              [
                "instant_offer",
                "An offer came without an interview or assessment",
              ],
              [
                "banking_requested",
                "Banking credentials or security information were requested",
              ],
              [
                "identity_requested",
                "Unnecessary identity documents were requested early",
              ],
              [
                "crypto_requested",
                "Cryptocurrency or a wallet action was requested",
              ],
              ["urgency", "The recruiter used pressure or unusual urgency"],
              ["domain_misspelled", "A domain appears misspelled"],
              [
                "link_unrelated",
                "The application link seems unrelated to the employer",
              ],
            ].map(([name, label]) => (
              <label className="checkbox" key={name}>
                <input type="checkbox" name={name} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="checkbox provider-consent">
          <input type="checkbox" name="processing_acknowledgement" required />I
          understand the entered vacancy text and answers are processed for this
          check and should not contain unnecessary personal or confidential
          information.
        </label>
        <button className="button w-fit" type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check warning signs"}
        </button>
      </form>
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}
      {providerNotice ? (
        <div className="notice notice-warning" role="status">
          {providerNotice}
        </div>
      ) : null}
      {result ? (
        <section className="tool-result stack-lg">
          <div
            className={`risk-summary risk-${result.riskTier}`}
            role="status"
            aria-live="polite"
          >
            <ShieldAlert aria-hidden="true" size={28} />
            <div>
              <p className="eyebrow">Automated screening result</p>
              <h2 className="section-title">{result.riskLabel}</h2>
              <p>{result.summary}</p>
            </div>
          </div>
          {result.flags.length > 0 ? (
            <div className="stack">
              <h3 className="m-0 text-xl font-bold">
                Individual warning flags
              </h3>
              {result.flags.map((flag) => (
                <article className="surface surface-pad stack" key={flag.code}>
                  <div className="cluster">
                    <CircleAlert aria-hidden="true" size={20} />
                    <strong>{flag.title}</strong>
                    <span
                      className={`status ${flag.severity === "high" ? "status-danger" : "status-warning"}`}
                    >
                      {flag.severity}
                    </span>
                  </div>
                  <p className="text-muted m-0">{flag.whyItMatters}</p>
                  <div>
                    <strong>Evidence found</strong>
                    <ul>
                      {flag.evidence.map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="notice">
              <CircleCheck aria-hidden="true" size={18} /> No listed warning
              sign was detected in the supplied information. That is not proof
              of safety.
            </div>
          )}
          <div className="decision-grid">
            <section>
              <h3>Verification steps</h3>
              <ol>
                {result.verificationSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
            <section>
              <h3>Safer next actions</h3>
              <ol>
                {result.safeNextActions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          </div>
          <details>
            <summary>Limits of this result</summary>
            <ul>
              {result.limitations.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <p>
              URL fetch performed:{" "}
              <strong>
                {result.inputCoverage.urlFetchPerformed ? "Yes" : "No"}
              </strong>
            </p>
          </details>
        </section>
      ) : null}
    </div>
  );
}
