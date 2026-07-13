import { describe, expect, it } from "vitest";

import {
  couldBeLookalike,
  evidenceSnippet,
  extractEmails,
  extractUrls,
  feeIsNegated,
  feeRequestInTokenWindow,
  findStatement,
  isSameOrSubdomain,
  normalizeDomain,
  normalizeConfusableDomain,
  registrableDomain,
  safetyWarningIsNegated,
  splitIntoStatements,
  unique,
} from "./signals";

describe("scam signal text boundaries", () => {
  it("deduplicates values and splits compact statements", () => {
    expect(unique(["one", "two", "one"])).toEqual(["one", "two"]);
    expect(splitIntoStatements("First sentence.  Second one!\nThird?")).toEqual(
      ["First sentence.", "Second one!", "Third?"],
    );
  });

  it("keeps evidence at 180 characters and truncates longer text", () => {
    expect(evidenceSnippet("a".repeat(180))).toHaveLength(180);
    const truncated = evidenceSnippet(`  ${"a".repeat(181)}  `);
    expect(truncated).toHaveLength(180);
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("finds the first accepted statement and supports explicit rejection", () => {
    const statements = ["No application fee.", "Pay a deposit today."];
    expect(
      findStatement(statements, [/fee|deposit/i], (statement) =>
        feeIsNegated(statement),
      ),
    ).toBe("Pay a deposit today.");
    expect(findStatement(statements, [/crypto/i])).toBeNull();
  });

  it("distinguishes safety negations from suspicious instructions", () => {
    expect(feeIsNegated("We never request an application fee.")).toBe(true);
    expect(feeIsNegated("Pay the application fee today.")).toBe(false);
    expect(feeRequestInTokenWindow("Transfer the processing fee now.")).toBe(
      true,
    );
    expect(feeRequestInTokenWindow("Do not pay any fee.")).toBe(false);
    expect(
      safetyWarningIsNegated("Do not share your password with anyone."),
    ).toBe(true);
    expect(safetyWarningIsNegated("Share your password over Telegram.")).toBe(
      false,
    );
  });
});

describe("scam signal domain boundaries", () => {
  it("normalizes email and URL domains and rejects malformed values", () => {
    expect(normalizeDomain(" Recruiter@WWW.Example.com ")).toBe("example.com");
    expect(normalizeDomain("https://www.example.com./jobs")).toBe(
      "example.com",
    );
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
  });

  it("accepts exact subdomains and flags bounded lookalikes", () => {
    expect(isSameOrSubdomain("jobs.example.com", "example.com")).toBe(true);
    expect(isSameOrSubdomain("badexample.com", "example.com")).toBe(false);
    expect(couldBeLookalike("example.com", "example.com")).toBe(false);
    expect(couldBeLookalike("jobs.example.com", "example.com")).toBe(false);
    expect(couldBeLookalike("examp1e.com", "example.com")).toBe(true);
    expect(couldBeLookalike("xn--exmple-cua.com", "example.com")).toBe(true);
    expect(couldBeLookalike("unrelated.test", "example.com")).toBe(false);
  });

  it("extracts eTLD+1 domains through the public-suffix parser", () => {
    expect(registrableDomain("careers.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("jobs.company.com.ng")).toBe("company.com.ng");
    expect(registrableDomain("localhost")).toBeNull();
  });

  it("normalises only the supported visual confusables", () => {
    expect(normalizeConfusableDomain("rnicros0ft.com")).toBe("microsoft.com");
    expect(normalizeConfusableDomain("paypa1.com")).toBe("paypal.com");
    expect(normalizeConfusableDomain("ordinary.com")).toBe("ordinary.com");
  });

  it("uses the registrable label for short and long lookalike boundaries", () => {
    expect(couldBeLookalike("jobs.acm3.co.uk", "acme.co.uk")).toBe(true);
    expect(couldBeLookalike("x0.com", "xo.com")).toBe(true);
    expect(
      couldBeLookalike("career-marketplace.com", "careerbuilder.com"),
    ).toBe(false);
  });

  it("allows known legitimate related-domain variants", () => {
    expect(couldBeLookalike("yahoo.co.uk", "yahoo.com")).toBe(false);
    expect(couldBeLookalike("outlook.co.uk", "outlook.com")).toBe(false);
  });

  it("extracts unique emails and strips URL punctuation", () => {
    expect(
      extractEmails("Write a@company.com, then a@company.com or b@agency.org."),
    ).toEqual(["a@company.com", "b@agency.org"]);
    expect(
      extractUrls([
        "Apply at https://jobs.example.com/opening).",
        "Mirror: www.example.org/jobs!",
      ]),
    ).toEqual([
      {
        raw: "https://jobs.example.com/opening",
        domain: "jobs.example.com",
        statement: "Apply at https://jobs.example.com/opening).",
      },
      {
        raw: "www.example.org/jobs",
        domain: "example.org",
        statement: "Mirror: www.example.org/jobs!",
      },
    ]);
  });
});
