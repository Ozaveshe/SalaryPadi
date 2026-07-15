import type { Metadata } from "next";
import Link from "next/link";

import { BackendNotice } from "@/components/backend-notice";
import { PageHeading } from "@/components/page-heading";
import { PrivateDataStatus } from "@/components/private-data-status";
import { requireViewer } from "@/lib/auth/dal";
import { getCandidateProfile } from "@/lib/career/repository";

export const metadata: Metadata = {
  title: "Job match profile",
  robots: { index: false, follow: false, nocache: true },
};

const EXPERIENCE_LEVELS = [
  { value: "unspecified", label: "Prefer not to say" },
  { value: "entry", label: "Entry" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
] as const;

const WORK_ARRANGEMENTS = [
  { value: "unspecified", label: "Prefer not to say" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On site" },
] as const;

const PAY_PERIODS = [
  { value: "", label: "Not stated" },
  { value: "monthly", label: "Per month" },
  { value: "annual", label: "Per year" },
  { value: "weekly", label: "Per week" },
  { value: "daily", label: "Per day" },
  { value: "hourly", label: "Per hour" },
] as const;

function amountValue(value: number | null): string {
  return value === null ? "" : String(value);
}

export default async function CandidateProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireViewer("/account/candidate-profile");
  const { status } = await searchParams;
  const result = await getCandidateProfile();
  const profile = result.data;

  return (
    <div className="site-shell stack-lg">
      <PageHeading
        eyebrow="Private workspace"
        title="Job match profile"
        description="Tell SalaryPadi what you are looking for and it will compare your answers against what each job's source published. Everything here is your own statement about yourself. It is private, it is never shown on community posts, and it is never shared with employers."
      />

      {status === "saved" ? (
        <div className="notice" role="status">
          Job match profile saved.
        </div>
      ) : status === "error" ? (
        <div className="notice notice-danger" role="alert">
          The profile could not be saved. Check the fields and try again. A pay
          expectation needs both a currency and a pay period.
        </div>
      ) : null}

      {result.state === "unconfigured" ? (
        <BackendNotice />
      ) : result.state !== "ready" ? (
        <PrivateDataStatus state={result.state} />
      ) : (
        <>
          <section
            className="surface surface-pad stack"
            aria-labelledby="how-heading"
          >
            <h2 className="section-title" id="how-heading">
              How the match is worked out
            </h2>
            <p className="text-muted m-0">
              Your match score compares four things: experience level, work
              arrangement, location eligibility, and pay. Every field is
              optional — anything you leave blank is treated as not stated, and
              it lowers how much of the comparison can be made rather than
              counting against you.
            </p>
            <p className="text-muted m-0 text-sm">
              The score does not compare skills, it is not an assessment of your
              suitability, and it does not predict whether you will be hired.
              Only an employer decides that.
            </p>
          </section>

          <form
            className="surface surface-pad stack-lg"
            action="/api/account/candidate-profile"
            method="post"
          >
            <fieldset className="stack">
              <legend className="section-title">About you</legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="headline">Headline</label>
                  <input
                    className="input"
                    defaultValue={profile?.headline ?? ""}
                    id="headline"
                    maxLength={160}
                    name="headline"
                    type="text"
                  />
                  <p className="field-help">
                    Optional. How you would describe your current role, for
                    example &ldquo;Backend engineer&rdquo;.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="years_experience">Years of experience</label>
                  <input
                    className="input"
                    defaultValue={
                      profile?.years_experience === null ||
                      profile?.years_experience === undefined
                        ? ""
                        : String(profile.years_experience)
                    }
                    id="years_experience"
                    inputMode="numeric"
                    max={60}
                    min={0}
                    name="years_experience"
                    type="number"
                  />
                  <p className="field-help">
                    Optional. A whole number, 0 to 60.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="experience_level">Experience level</label>
                  <select
                    className="select"
                    defaultValue={profile?.experience_level ?? "unspecified"}
                    id="experience_level"
                    name="experience_level"
                  >
                    {EXPERIENCE_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-help">
                    Compared against the level each posting asks for.
                  </p>
                </div>
              </div>
              <div className="field">
                <label htmlFor="summary">Summary</label>
                <textarea
                  className="textarea"
                  defaultValue={profile?.summary ?? ""}
                  id="summary"
                  maxLength={5000}
                  name="summary"
                  rows={4}
                />
                <p className="field-help">
                  Optional and private. Not used in the match score.
                </p>
              </div>
            </fieldset>

            <fieldset className="stack">
              <legend className="section-title">
                What you are looking for
              </legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="desired_work_arrangement">
                    Preferred work arrangement
                  </label>
                  <select
                    className="select"
                    defaultValue={
                      profile?.desired_work_arrangement ?? "unspecified"
                    }
                    id="desired_work_arrangement"
                    name="desired_work_arrangement"
                  >
                    {WORK_ARRANGEMENTS.map((arrangement) => (
                      <option key={arrangement.value} value={arrangement.value}>
                        {arrangement.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="location_country">Country you live in</label>
                  <input
                    className="input"
                    defaultValue={profile?.location_country ?? ""}
                    id="location_country"
                    maxLength={2}
                    name="location_country"
                    placeholder="NG"
                    type="text"
                  />
                  <p className="field-help">
                    Optional. A two-letter country code, for example NG.
                    Compared against who each posting says it can hire.
                  </p>
                </div>
              </div>
              <div className="field">
                <label className="cluster" htmlFor="open_to_relocation">
                  <input
                    defaultChecked={profile?.open_to_relocation ?? false}
                    id="open_to_relocation"
                    name="open_to_relocation"
                    type="checkbox"
                  />
                  <span>I am open to relocating</span>
                </label>
                <p className="field-help">
                  Softens, but does not remove, a mismatch when a role cannot
                  hire in your country.
                </p>
              </div>
            </fieldset>

            <fieldset className="stack">
              <legend className="section-title">Pay expectation</legend>
              <p className="field-help m-0">
                Optional. If you give an amount you must also give a currency
                and a pay period, otherwise it cannot be compared with a
                posting. SalaryPadi never converts between currencies here, so a
                role quoted in another currency is reported as not compared
                rather than guessed.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="desired_salary_min">Minimum amount</label>
                  <input
                    className="input"
                    defaultValue={amountValue(
                      profile?.desired_salary_min ?? null,
                    )}
                    id="desired_salary_min"
                    inputMode="decimal"
                    name="desired_salary_min"
                    type="text"
                  />
                </div>
                <div className="field">
                  <label htmlFor="desired_salary_max">Maximum amount</label>
                  <input
                    className="input"
                    defaultValue={amountValue(
                      profile?.desired_salary_max ?? null,
                    )}
                    id="desired_salary_max"
                    inputMode="decimal"
                    name="desired_salary_max"
                    type="text"
                  />
                </div>
                <div className="field">
                  <label htmlFor="desired_currency_code">Currency</label>
                  <input
                    className="input"
                    defaultValue={profile?.desired_currency_code ?? ""}
                    id="desired_currency_code"
                    maxLength={3}
                    name="desired_currency_code"
                    placeholder="NGN"
                    type="text"
                  />
                </div>
                <div className="field">
                  <label htmlFor="desired_pay_period">Pay period</label>
                  <select
                    className="select"
                    defaultValue={profile?.desired_pay_period ?? ""}
                    id="desired_pay_period"
                    name="desired_pay_period"
                  >
                    {PAY_PERIODS.map((period) => (
                      <option key={period.value} value={period.value}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            <p className="field-help m-0">
              Saving records these as your own statement about yourself, dated
              now. You can change or clear any of it at any time.
            </p>
            <button className="button w-fit" type="submit">
              Save job match profile
            </button>
          </form>

          <section className="surface surface-pad stack">
            <h2 className="section-title">Your private records</h2>
            <div className="cluster">
              <Link className="button button-secondary" href="/account">
                Back to my account
              </Link>
              <Link className="button button-secondary" href="/jobs">
                See jobs with your match
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
