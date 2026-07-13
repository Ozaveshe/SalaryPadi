import type { ScamFlagCode, ScamFlagSeverity } from "./types";

interface FlagDefinition {
  severity: ScamFlagSeverity;
  title: string;
  whyItMatters: string;
  verificationSteps: string[];
}

export const FLAG_DEFINITIONS: Record<ScamFlagCode, FlagDefinition> = {
  upfront_payment: {
    severity: "high",
    title: "Payment requested during recruitment",
    whyItMatters:
      "A request to pay before employment is independently verified can expose an applicant to financial loss.",
    verificationSteps: [
      "Do not pay. Contact the employer through contact details found independently on its official website.",
      "Ask the employer to confirm in writing whether any recruitment fee is authorised and refundable.",
    ],
  },
  training_or_equipment_fee: {
    severity: "high",
    title: "Training or equipment payment requested",
    whyItMatters:
      "A recruiter-controlled purchase, deposit, or training fee can be used to collect money before a real job exists.",
    verificationSteps: [
      "Do not buy equipment, software, or training through a recruiter's payment link.",
      "Verify the role and purchasing policy with the employer through an independently located official channel.",
    ],
  },
  personal_email_domain: {
    severity: "caution",
    title: "Recruitment contact uses a personal email domain",
    whyItMatters:
      "A personal mailbox does not prove fraud, but it is harder to connect to the stated employer than an authorised corporate address.",
    verificationSteps: [
      "Find the employer's official domain independently and ask it to confirm that the recruiter is authorised.",
      "Check whether the same role appears on an official employer or trusted recruitment page.",
    ],
  },
  suspicious_domain: {
    severity: "high",
    title: "A domain may imitate the employer",
    whyItMatters:
      "Small spelling changes and internationalised lookalike domains can send applicants to a party unrelated to the employer.",
    verificationSteps: [
      "Type the employer's known official address yourself instead of opening the supplied link.",
      "Compare every character in the email or website domain with the official domain.",
    ],
  },
  messaging_only_interview: {
    severity: "caution",
    title: "Interview is described as messaging-only",
    whyItMatters:
      "Text-only contact makes it harder to verify the recruiter's identity and the employer's involvement.",
    verificationSteps: [
      "Request a voice or video conversation using an employer-controlled account.",
      "Confirm the interview schedule through an independently verified employer contact.",
    ],
  },
  unrealistic_compensation: {
    severity: "caution",
    title: "You marked the compensation as unrealistic",
    whyItMatters:
      "A pay claim that you consider unrealistic deserves verification, but SalaryPadi does not infer a market salary from the text.",
    verificationSteps: [
      "Ask for a written breakdown of base pay, variable pay, currency, pay period, deductions, and conditions.",
      "Compare the claim with sources you trust for the same role, location, and arrangement.",
    ],
  },
  vague_employer_identity: {
    severity: "caution",
    title: "Employer identity is unclear",
    whyItMatters:
      "Without a verifiable legal or trading identity, it is difficult to confirm who is making the offer and handling applicant data.",
    verificationSteps: [
      "Ask for the employer's full legal or trading name, official website, physical jurisdiction, and named hiring contact.",
      "Verify those details using sources found independently of the vacancy message.",
    ],
  },
  instant_offer: {
    severity: "high",
    title: "Offer appears to skip an assessment",
    whyItMatters:
      "An immediate offer without a role-relevant conversation or assessment gives little opportunity to verify either party.",
    verificationSteps: [
      "Ask for a live conversation, written job description, reporting line, and formal contract before accepting.",
      "Confirm the offer with the employer through an independently verified contact.",
    ],
  },
  banking_credentials: {
    severity: "high",
    title: "Banking credentials or security information requested",
    whyItMatters:
      "Passwords, PINs, OTPs, card security data, and bank-login details are not needed to assess a job application and can enable account theft.",
    verificationSteps: [
      "Do not share a password, PIN, OTP, CVV, card number, or online-banking login.",
      "If any credential was already shared, contact the bank immediately through its official channel.",
    ],
  },
  unnecessary_identity_documents: {
    severity: "high",
    title: "Unnecessary or early identity documents requested",
    whyItMatters:
      "Sensitive identity documents requested before the employer and purpose are verified can be misused for impersonation or account opening.",
    verificationSteps: [
      "Do not send an identity document until the employer, purpose, retention period, and secure handling process are verified.",
      "Ask whether a less sensitive or redacted document can satisfy a legitimate later-stage requirement.",
    ],
  },
  cryptocurrency_request: {
    severity: "high",
    title: "Cryptocurrency payment or transfer requested",
    whyItMatters:
      "A recruitment payment routed through cryptocurrency can be difficult to reverse and may hide the recipient's identity.",
    verificationSteps: [
      "Do not send cryptocurrency or connect a wallet for recruitment, training, or equipment.",
      "Verify the role with the employer through an independently located official contact.",
    ],
  },
  urgency_pressure: {
    severity: "caution",
    title: "Pressure or artificial urgency detected",
    whyItMatters:
      "A short deadline can discourage independent verification and careful review of payment or data requests.",
    verificationSteps: [
      "Pause and verify the employer, recruiter, contract, and destination links before acting.",
      "Ask for reasonable time to review the written offer without sharing money or sensitive data.",
    ],
  },
  unrelated_application_link: {
    severity: "caution",
    title: "Application link is not tied to a confirmed employer domain",
    whyItMatters:
      "A different host may be a legitimate applicant-tracking provider, but it needs confirmation before credentials or personal data are submitted.",
    verificationSteps: [
      "Navigate to the employer's official careers page independently and locate the same vacancy there.",
      "Ask the employer to confirm the external application host before submitting personal data.",
    ],
  },
};

export const PERSONAL_EMAIL_DOMAINS = new Set([
  "email.com",
  "fastmail.com",
  "gmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.com.au",
  "yahoo.com.ng",
  "yahoo.co.in",
  "yahoo.ca",
  "yahoo.de",
  "yahoo.fr",
  "ymail.com",
  "rocketmail.com",
  "outlook.com",
  "outlook.co.uk",
  "outlook.de",
  "outlook.fr",
  "outlook.in",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "icloud.com",
  "aol.com",
  "mail.com",
  "proton.me",
  "protonmail.com",
  "tuta.com",
  "tutanota.com",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
]);
