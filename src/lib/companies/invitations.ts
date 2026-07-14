export const companyEvidenceInvitations = {
  calculator:
    "If this calculation helped, you can privately add your own original pay evidence for a moderated cohort.",
  application:
    "After applying, you can share only your own interview process or offer evidence. Do not include confidential answers.",
  interview:
    "When your interview is complete, a structured first-party account can help the next applicant understand the process.",
  offer:
    "If you received an offer, preserve the original currency, period and gross or net basis in a private salary contribution.",
  alert:
    "Job alerts find openings; first-party contributions help applicants evaluate the employer after they engage.",
} as const;

export type CompanyEvidenceInvitationKind =
  keyof typeof companyEvidenceInvitations;
