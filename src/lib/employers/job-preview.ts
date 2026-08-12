export interface EmployerJobPreviewData {
  companyName: string;
  title: string;
  location: string;
  workMode: string;
  employmentType: string;
  experienceLevel: string;
  description: string;
  requirements: string;
  benefits: string | null;
  eligibilityScope: string;
  eligibilityEvidence: string;
  salary: string | null;
  applicationHost: string;
  deadline: string | null;
}

function value(form: FormData, key: string): string {
  const item = form.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function label(raw: string): string {
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function buildEmployerJobPreview(
  form: FormData,
): EmployerJobPreviewData {
  const minimum = value(form, "salary_minimum");
  const maximum = value(form, "salary_maximum");
  const currency = value(form, "currency");
  const period = value(form, "pay_period");
  const applicationUrl = value(form, "application_url");
  let applicationHost = "Invalid application destination";
  try {
    applicationHost = new URL(applicationUrl).hostname;
  } catch {
    // Browser validation prevents this state from being previewed through the
    // UI, but the pure decoder remains honest for direct callers and tests.
  }
  const salaryAmounts =
    minimum && maximum
      ? `${minimum}–${maximum}`
      : minimum
        ? `From ${minimum}`
        : maximum
          ? `Up to ${maximum}`
          : "";

  return {
    companyName: value(form, "company_name"),
    title: value(form, "title"),
    location: value(form, "location"),
    workMode: label(value(form, "work_mode")),
    employmentType: label(value(form, "employment_type")),
    experienceLevel: label(value(form, "experience_level")),
    description: value(form, "description"),
    requirements: value(form, "requirements"),
    benefits: value(form, "benefits") || null,
    eligibilityScope: label(value(form, "eligibility_scope")),
    eligibilityEvidence: value(form, "eligibility_evidence"),
    salary:
      salaryAmounts && currency
        ? `${currency} ${salaryAmounts}${period && period !== "unknown" ? ` / ${label(period)}` : ""}`
        : null,
    applicationHost,
    deadline: value(form, "deadline") || null,
  };
}
