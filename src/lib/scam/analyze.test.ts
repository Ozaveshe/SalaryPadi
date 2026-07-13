import { afterEach, describe, expect, it, vi } from "vitest";

import { checkJobScam } from "./analyze";
import type { ScamFlagCode } from "./types";

function flagCodes(text: string, answers = {}): ScamFlagCode[] {
  return checkJobScam({ vacancyText: text, answers }).flags.map(
    (flag) => flag.code,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fee and payment warnings", () => {
  it("finds a generic application fee and explains the evidence", () => {
    const result = checkJobScam({
      vacancyText:
        "A registration fee is required before we can process your application.",
    });

    expect(result.riskTier).toBe("high_caution");
    expect(result.flags).toContainEqual(
      expect.objectContaining({
        code: "upfront_payment",
        severity: "high",
        source: "text",
        evidence: [
          "A registration fee is required before we can process your application.",
        ],
      }),
    );
    expect(result.summary).toContain("does not prove fraud");
  });

  it("classifies training and equipment payments separately", () => {
    expect(
      flagCodes(
        "Purchase your laptop from our approved seller before starting.",
      ),
    ).toContain("training_or_equipment_fee");
    expect(
      flagCodes("Pay the mandatory training fee to reserve your role."),
    ).toContain("training_or_equipment_fee");
  });

  it("does not flag an explicit no-fee statement", () => {
    expect(
      flagCodes(
        "No application fees are required. We will never ask you to pay a processing fee.",
      ),
    ).not.toEqual(
      expect.arrayContaining(["upfront_payment", "training_or_equipment_fee"]),
    );
  });

  it.each([
    "Send the logistics fee to the coordinator before onboarding.",
    "Kindly transfer your processing fee to the account provided.",
    "You need to remit the registration payment before your interview.",
  ])("detects rephrased recruitment fee instructions: %s", (text) => {
    expect(flagCodes(text)).toContain("upfront_payment");
  });

  it("does not let an unrelated negation hide a later fee instruction", () => {
    expect(
      flagCodes(
        "No fee is charged by the employer; simply transfer the processing fee to the agent.",
      ),
    ).toContain("upfront_payment");
  });

  it("does not flag a clearly employer-paid registration cost", () => {
    expect(
      flagCodes(
        "The employer will pay all registration fees on your behalf. Candidates pay nothing.",
      ),
    ).not.toContain("upfront_payment");
  });

  it("does not mistake an employer-paid equipment allowance for a fee", () => {
    expect(
      flagCodes(
        "The company will purchase your equipment and provides an equipment purchase allowance.",
      ),
    ).not.toContain("training_or_equipment_fee");
  });

  it("uses structured fee answers when the pasted text is incomplete", () => {
    const result = checkJobScam({
      vacancyText: "Short role summary.",
      answers: { feeRequested: true, feePurpose: "equipment" },
    });

    expect(result.flags[0]).toMatchObject({
      code: "training_or_equipment_fee",
      source: "answers",
    });
  });

  it("merges text and structured evidence instead of double-counting a flag", () => {
    const result = checkJobScam({
      vacancyText: "An application fee is required.",
      answers: { feeRequested: true, feePurpose: "application" },
    });

    const fees = result.flags.filter((flag) => flag.code === "upfront_payment");
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ source: "both" });
    expect(fees[0]?.evidence).toHaveLength(2);
  });
});

describe("contact, domain, and link warnings", () => {
  it("flags a personal recruiter email without treating it as proof", () => {
    const result = checkJobScam({
      answers: { recruiterEmail: "recruitment.team@gmail.com" },
    });

    expect(result.riskTier).toBe("caution");
    expect(result.flags[0]).toMatchObject({
      code: "personal_email_domain",
      severity: "caution",
    });
    expect(result.flags[0]?.whyItMatters).toContain("does not prove fraud");
    expect(result.flags[0]?.evidence[0]).not.toContain("recruitment.team");
  });

  it("finds personal email domains in pasted text", () => {
    expect(flagCodes("Send your CV to hiringdesk@yahoo.com.")).toContain(
      "personal_email_domain",
    );
  });

  it.each([
    "yandex.com",
    "gmx.com",
    "gmx.net",
    "zoho.com",
    "mail.com",
    "yahoo.com.ng",
    "outlook.co.uk",
  ])("recognises the personal mailbox domain %s", (domain) => {
    expect(flagCodes(`Send your CV to recruiter@${domain}.`)).toContain(
      "personal_email_domain",
    );
  });

  it("flags a near-match or internationalised domain for verification", () => {
    const typo = checkJobScam({
      answers: {
        officialEmployerDomain: "acme.com",
        recruiterEmail: "jobs@acm3.com",
      },
    });
    expect(typo.flags.map((flag) => flag.code)).toContain("suspicious_domain");

    const internationalised = checkJobScam({
      answers: { applicationUrl: "https://xn--acm-epa.example/apply" },
    });
    expect(internationalised.flags.map((flag) => flag.code)).toContain(
      "suspicious_domain",
    );
  });

  it("compares registrable domains instead of being distracted by subdomains", () => {
    const result = checkJobScam({
      answers: {
        officialEmployerDomain: "acme.co.uk",
        recruiterEmail: "jobs@careers.acm3.co.uk",
      },
    });

    expect(result.flags.map((flag) => flag.code)).toContain(
      "suspicious_domain",
    );
  });

  it.each([
    ["microsoft.com", "jobs@rnicros0ft.com"],
    ["paypal.com", "jobs@paypa1.com"],
    ["xo.com", "jobs@x0.com"],
  ])(
    "normalises visual ASCII confusables in %s versus %s",
    (officialEmployerDomain, recruiterEmail) => {
      const result = checkJobScam({
        answers: { officialEmployerDomain, recruiterEmail },
      });
      expect(result.flags.map((flag) => flag.code)).toContain(
        "suspicious_domain",
      );
    },
  );

  it("flags a mixed-script internationalised lookalike without opening it", () => {
    const result = checkJobScam({
      answers: {
        officialEmployerDomain: "paypal.com",
        applicationUrl: "https://раypal.com/careers",
      },
    });

    expect(result.flags.map((flag) => flag.code)).toContain(
      "suspicious_domain",
    );
    expect(result.inputCoverage.urlFetchPerformed).toBe(false);
  });

  it("does not elevate known legitimate regional mailbox variants as lookalikes", () => {
    const result = checkJobScam({
      answers: {
        officialEmployerDomain: "yahoo.com",
        recruiterEmail: "jobs@yahoo.co.uk",
      },
    });

    expect(result.flags.map((flag) => flag.code)).toContain(
      "personal_email_domain",
    );
    expect(result.flags.map((flag) => flag.code)).not.toContain(
      "suspicious_domain",
    );
  });

  it("flags an application host unrelated to the entered official domain", () => {
    const result = checkJobScam({
      vacancyText: "Apply at https://forms.example.net/acme-role today.",
      answers: { officialEmployerDomain: "acme.com" },
    });

    expect(result.flags).toContainEqual(
      expect.objectContaining({
        code: "unrelated_application_link",
        source: "text",
      }),
    );
    expect(
      result.flags.find((flag) => flag.code === "unrelated_application_link")
        ?.whyItMatters,
    ).toContain("legitimate applicant-tracking provider");
  });

  it("accepts employer subdomains and user-confirmed ATS domains", () => {
    const officialSubdomain = checkJobScam({
      answers: {
        officialEmployerDomain: "acme.com",
        applicationUrl: "https://careers.acme.com/jobs/42",
      },
    });
    expect(officialSubdomain.flags.map((flag) => flag.code)).not.toContain(
      "unrelated_application_link",
    );

    const trustedAts = checkJobScam({
      answers: {
        officialEmployerDomain: "acme.com",
        trustedApplicationDomains: ["jobs.ats.example"],
        applicationUrl: "https://jobs.ats.example/acme/42",
      },
    });
    expect(trustedAts.flags.map((flag) => flag.code)).not.toContain(
      "unrelated_application_link",
    );
  });

  it("honours an explicit answer that a different application host is related", () => {
    const result = checkJobScam({
      answers: {
        officialEmployerDomain: "acme.com",
        applicationUrl: "https://vendor.example/jobs/42",
        applicationLinkRelatedToEmployer: true,
      },
    });

    expect(result.flags.map((flag) => flag.code)).not.toContain(
      "unrelated_application_link",
    );
  });
});

describe("interview, employer, offer, and pressure warnings", () => {
  it("detects messaging-only interviews but not an explicit safety disclaimer", () => {
    expect(
      flagCodes("The interview will be conducted by WhatsApp chat only."),
    ).toContain("messaging_only_interview");
    expect(
      flagCodes("We never conduct WhatsApp-only interviews or assessments."),
    ).not.toContain("messaging_only_interview");
  });

  it("detects vague employers and offers that skip assessment", () => {
    const codes = flagCodes(
      "We represent a confidential employer. No interview or assessment is required.",
    );

    expect(codes).toEqual(
      expect.arrayContaining(["vague_employer_identity", "instant_offer"]),
    );
  });

  it("detects pressure without treating the word urgent alone as decisive", () => {
    expect(
      flagCodes("Act now. Reply immediately to reserve your slot."),
    ).toContain("urgency_pressure");
    expect(
      flagCodes("We are urgently hiring a nurse for the night shift."),
    ).not.toContain("urgency_pressure");
  });

  it("supports structured interview, identity, offer, and urgency answers", () => {
    const result = checkJobScam({
      answers: {
        interviewChannel: "messaging_only",
        employerIdentityIsClear: false,
        offerMadeWithoutAssessment: true,
        pressureOrUrgency: true,
      },
    });

    expect(result.flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "messaging_only_interview",
        "vague_employer_identity",
        "instant_offer",
        "urgency_pressure",
      ]),
    );
  });

  it("detects Nigeria-relevant Pidgin messaging and urgency pressure", () => {
    const codes = flagCodes(
      "Interview na only WhatsApp chat, no call or video. Abeg do am sharp sharp before slot go finish.",
    );

    expect(codes).toEqual(
      expect.arrayContaining(["messaging_only_interview", "urgency_pressure"]),
    );
  });
});

describe("sensitive information and cryptocurrency warnings", () => {
  it("detects requests for bank secrets and early identity documents", () => {
    const codes = flagCodes(
      "Send your online banking password and OTP immediately. To apply, upload your passport.",
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "banking_credentials",
        "unnecessary_identity_documents",
        "urgency_pressure",
      ]),
    );
  });

  it("does not turn a safety warning into a banking or ID flag", () => {
    const codes = flagCodes(
      "Do not send your PIN or OTP. You should not provide a passport before interview.",
    );

    expect(codes).not.toEqual(
      expect.arrayContaining([
        "banking_credentials",
        "unnecessary_identity_documents",
      ]),
    );
  });

  it("detects cryptocurrency transfers but not an ordinary crypto job", () => {
    expect(
      flagCodes(
        "Send the application deposit using USDT to this wallet address.",
      ),
    ).toContain("cryptocurrency_request");
    expect(
      flagCodes(
        "We are hiring a Bitcoin protocol engineer for our security team.",
      ),
    ).not.toContain("cryptocurrency_request");
  });

  it("detects Pidgin fee and cryptocurrency payment instructions", () => {
    const codes = flagCodes(
      "Abeg make you send 5k registration money sharp sharp. You go transfer USDT give the coordinator.",
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        "upfront_payment",
        "cryptocurrency_request",
        "urgency_pressure",
      ]),
    );
  });

  it("adds a recovery action when a sensitive request is reported", () => {
    const result = checkJobScam({
      answers: {
        bankingCredentialsRequested: true,
        unnecessaryIdentityDocumentsRequested: true,
        cryptocurrencyRequested: true,
      },
    });

    expect(result.flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "banking_credentials",
        "unnecessary_identity_documents",
        "cryptocurrency_request",
      ]),
    );
    expect(result.safeNextActions.join(" ")).toContain(
      "contact the relevant bank or service immediately",
    );
  });
});

describe("compensation and cautious result semantics", () => {
  it("never infers unrealistic pay from vacancy text alone", () => {
    const result = checkJobScam({
      vacancyText:
        "Earn NGN 100,000,000 every week as a junior assistant working two hours.",
    });

    expect(result.flags.map((flag) => flag.code)).not.toContain(
      "unrealistic_compensation",
    );
  });

  it("flags compensation only after the user explicitly marks it", () => {
    const result = checkJobScam({
      vacancyText: "Earn NGN 100,000,000 every week.",
      answers: { compensationSeemsUnrealistic: true },
    });

    expect(result.flags).toContainEqual(
      expect.objectContaining({
        code: "unrealistic_compensation",
        source: "answers",
      }),
    );
    expect(result.flags[0]?.whyItMatters).toContain(
      "does not infer a market salary",
    );
  });

  it("uses a lower-indication tier without claiming safety when no flags match", () => {
    const result = checkJobScam({
      vacancyText:
        "Acme is hiring a product designer. Apply through the careers page after reviewing the role.",
    });

    expect(result.riskTier).toBe("lower_indication");
    expect(result.flags).toEqual([]);
    expect(result.summary).toContain("not a safety guarantee");
    expect(result.limitations.join(" ")).toContain("not a determination");
  });

  it("returns explainable verification steps for every flag", () => {
    const result = checkJobScam({
      answers: {
        recruiterEmail: "hiring@gmail.com",
        employerIdentityIsClear: false,
        applicationLinkRelatedToEmployer: false,
      },
    });

    expect(result.flags.length).toBeGreaterThan(0);
    result.flags.forEach((flag) => {
      expect(flag.title.length).toBeGreaterThan(0);
      expect(flag.whyItMatters.length).toBeGreaterThan(0);
      expect(flag.evidence.length).toBeGreaterThan(0);
      expect(flag.verificationSteps.length).toBeGreaterThan(0);
    });
    expect(result.verificationSteps.length).toBeGreaterThan(
      result.flags.length,
    );
  });
});

describe("local-only analysis", () => {
  it("does not fetch, follow, or verify URLs", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = checkJobScam({
      vacancyText: "Apply at https://untrusted.example/jobs/1.",
      answers: { officialEmployerDomain: "employer.example" },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.inputCoverage.urlFetchPerformed).toBe(false);
    expect(result.limitations.join(" ")).toContain(
      "does not open, fetch, follow",
    );
  });

  it("reports which input surfaces were actually checked", () => {
    const result = checkJobScam({
      vacancyText: "A role description.",
      answers: {
        feeRequested: false,
        compensationSeemsUnrealistic: false,
      },
    });

    expect(result.inputCoverage).toEqual({
      textAnalyzed: true,
      structuredAnswersProvided: 2,
      urlFetchPerformed: false,
    });
  });
});
