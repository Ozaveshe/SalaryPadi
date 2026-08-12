import { describe, expect, it } from "vitest";
import { buildEmployerJobPreview } from "./job-preview";

describe("employer job preview", () => {
  it("maps the submitted vacancy without inventing missing pay or benefits", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      company_name: "Acme Africa",
      title: "Platform Engineer",
      location: "Lagos",
      work_mode: "hybrid",
      employment_type: "full_time",
      experience_level: "mid",
      description: "Build reliable systems.",
      requirements: "Production TypeScript experience.",
      eligibility_scope: "nigeria",
      eligibility_evidence:
        "The posting explicitly accepts applicants in Nigeria.",
      application_url: "https://jobs.acme.example/platform",
      pay_period: "unknown",
    }))
      form.set(key, value);
    expect(buildEmployerJobPreview(form)).toMatchObject({
      companyName: "Acme Africa",
      workMode: "Hybrid",
      employmentType: "Full Time",
      benefits: null,
      salary: null,
      applicationHost: "jobs.acme.example",
    });
  });

  it("renders a bounded salary range and source period", () => {
    const form = new FormData();
    form.set("salary_minimum", "500000");
    form.set("salary_maximum", "800000");
    form.set("currency", "NGN");
    form.set("pay_period", "monthly");
    form.set("application_url", "https://employer.example/apply");
    expect(buildEmployerJobPreview(form).salary).toBe(
      "NGN 500000–800000 / Monthly",
    );
  });

  it("does not mistake malformed application text for a verified host", () => {
    const form = new FormData();
    form.set("application_url", "not a url");
    expect(buildEmployerJobPreview(form).applicationHost).toBe(
      "Invalid application destination",
    );
  });
});
