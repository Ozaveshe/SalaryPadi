import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { InterviewExperience } from "@/lib/companies/contracts";

import { InterviewExperienceCard } from "./interview-experience-card";

const now = new Date("2026-07-22T00:00:00.000Z");

function interview(
  overrides: Partial<InterviewExperience> = {},
): InterviewExperience {
  return {
    id: "3f4c8a4e-92c1-4f4e-9d2a-1d2f3a4b5c6d",
    company_slug: "kuda",
    role_family: "Software Engineering",
    seniority: "mid",
    country_code: "NG",
    application_source: "company_site",
    stages: ["Recruiter screen", "Technical assessment", "Panel interview"],
    approximate_duration_label: "About 3 weeks",
    difficulty: 4,
    feedback_received: true,
    outcome: "offer_received",
    question_themes:
      "System design for payments, SQL joins, behavioural questions about handling production incidents.",
    general_experience:
      "Structured process with clear communication at every stage.",
    published_at: "2026-06-10T00:00:00.000Z",
    provenance_label: "Community contribution, moderated before publication",
    ...overrides,
  };
}

describe("InterviewExperienceCard", () => {
  it("renders the full report with a recent-date badge", () => {
    const html = renderToStaticMarkup(
      createElement(InterviewExperienceCard, { interview: interview(), now }),
    );

    expect(html).toContain("Difficulty 4/5");
    expect(html).toContain("Offer Received");
    expect(html).toContain("Recruiter screen");
    expect(html).toContain("System design for payments");
    expect(html).toContain("Feedback received");
    expect(html).toContain("Reported");
    expect(html).not.toContain("Older report");
    expect(html).toContain(
      "Community contribution, moderated before publication",
    );
  });

  it("marks a report older than a year and warns the process may have changed", () => {
    const html = renderToStaticMarkup(
      createElement(InterviewExperienceCard, {
        interview: interview({ published_at: "2025-05-01T00:00:00.000Z" }),
        now,
      }),
    );

    expect(html).toContain("Older report");
    expect(html).toContain("over a year old");
  });

  it("omits sections the contributor did not provide", () => {
    const html = renderToStaticMarkup(
      createElement(InterviewExperienceCard, {
        interview: interview({
          stages: [],
          question_themes: null,
          general_experience: null,
          difficulty: null,
          outcome: null,
          feedback_received: null,
          application_source: null,
          approximate_duration_label: null,
        }),
        now,
      }),
    );

    expect(html).not.toContain("Process stages");
    expect(html).not.toContain("Question themes");
    expect(html).not.toContain("Difficulty");
  });
});
