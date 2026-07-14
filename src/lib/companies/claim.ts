import { parse as parseDomain } from "tldts";
import { z } from "zod";

import { containsLikelyPrivateContact } from "@/lib/contributions/schemas";

const corporateDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/,
  )
  .refine((value) => {
    const parsed = parseDomain(value, {
      allowPrivateDomains: false,
      validateHostname: true,
    });
    return parsed.isIcann && parsed.domain === value;
  }, "Enter the organisation's registrable domain.");

export const companyClaimSchema = z
  .object({
    company_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    corporate_domain: corporateDomainSchema,
    relationship: z.enum(["owner", "employee", "authorised_representative"]),
    job_title: z.string().trim().min(2).max(120),
    evidence_reference: z.string().trim().max(300).default(""),
  })
  .superRefine((value, context) => {
    if (containsLikelyPrivateContact(value.evidence_reference)) {
      context.addIssue({
        code: "custom",
        path: ["evidence_reference"],
        message: "Remove email addresses and phone numbers.",
      });
    }
  });
