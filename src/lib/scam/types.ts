export type ScamFlagCode =
  | "upfront_payment"
  | "training_or_equipment_fee"
  | "personal_email_domain"
  | "suspicious_domain"
  | "messaging_only_interview"
  | "unrealistic_compensation"
  | "vague_employer_identity"
  | "instant_offer"
  | "banking_credentials"
  | "unnecessary_identity_documents"
  | "cryptocurrency_request"
  | "urgency_pressure"
  | "unrelated_application_link";

export type ScamFlagSeverity = "caution" | "high";
export type ScamFlagSource = "text" | "answers" | "both";
export type ScamRiskTier = "lower_indication" | "caution" | "high_caution";

export type InterviewChannelAnswer =
  "video_or_phone" | "in_person" | "messaging_only" | "unknown";

export type FeePurposeAnswer =
  "application" | "training" | "equipment" | "other";

export interface ScamStructuredAnswers {
  employerName?: string;
  recruiterEmail?: string;
  officialEmployerDomain?: string;
  /** User-confirmed application hosts such as an employer's ATS provider. */
  trustedApplicationDomains?: readonly string[];
  applicationUrl?: string;
  feeRequested?: boolean;
  feePurpose?: FeePurposeAnswer;
  interviewChannel?: InterviewChannelAnswer;
  /** Only this explicit answer can trigger the compensation warning. */
  compensationSeemsUnrealistic?: boolean;
  employerIdentityIsClear?: boolean;
  offerMadeWithoutAssessment?: boolean;
  bankingCredentialsRequested?: boolean;
  unnecessaryIdentityDocumentsRequested?: boolean;
  cryptocurrencyRequested?: boolean;
  pressureOrUrgency?: boolean;
  domainAppearsMisspelled?: boolean;
  applicationLinkRelatedToEmployer?: boolean;
}

export interface ScamCheckInput {
  vacancyText?: string;
  answers?: ScamStructuredAnswers;
}

export interface ScamWarningFlag {
  code: ScamFlagCode;
  severity: ScamFlagSeverity;
  title: string;
  whyItMatters: string;
  evidence: string[];
  source: ScamFlagSource;
  verificationSteps: string[];
}

export interface ScamCheckResult {
  riskTier: ScamRiskTier;
  riskLabel: string;
  summary: string;
  flags: ScamWarningFlag[];
  verificationSteps: string[];
  safeNextActions: string[];
  limitations: string[];
  inputCoverage: {
    textAnalyzed: boolean;
    structuredAnswersProvided: number;
    /** This initial checker is intentionally local-only. */
    urlFetchPerformed: false;
  };
}
