import type { Job } from "./types";

export const africaEvidenceDefinitions = [
  {
    key: "hndAccepted",
    label: "HND accepted",
    pattern:
      /\b(?:hnd\s+(?:is\s+)?accepted|accept(?:ed|s|ing)?\s+(?:an?\s+)?hnd|b\.?sc\.?\s*\/\s*hnd|hnd\s*\/\s*b\.?sc\.?|bachelor(?:'s)?(?:\s+degree)?\s+or\s+hnd|hnd\s+or\s+(?:b\.?sc\.?|bachelor))\b/i,
  },
  {
    key: "bscRequired",
    label: "BSc required",
    pattern:
      /(?:\b(?:b\.?sc\.?|bachelor(?:'s)?(?:\s+degree)?)\b.{0,35}\b(?:required|minimum|must|essential)\b|\b(?:must|required to)\b.{0,35}\b(?:hold|have)\b.{0,20}\b(?:b\.?sc\.?|bachelor(?:'s)?)\b)/i,
  },
  { key: "nyscRequired", label: "NYSC mentioned", pattern: /\bnysc\b/i },
  {
    key: "graduateTrainee",
    label: "Graduate trainee",
    pattern:
      /\b(?:graduate\s+(?:programme|program|scheme|trainee)|trainee\s+programme)\b/i,
  },
  {
    key: "internship",
    label: "Internship",
    pattern: /\b(?:internship|intern)\b/i,
  },
  {
    key: "professionalCertification",
    label: "Professional certification",
    pattern:
      /\b(?:professional\s+certification|certification\s+(?:required|preferred|desired)|certified\s+(?:professional|accountant|engineer)|acca|ican|cipm|cips|pmp)\b/i,
  },
  {
    key: "localLanguage",
    label: "Local language",
    pattern:
      /\b(?:local\s+language|yoruba|igbo|hausa|swahili|kiswahili|amharic|twi|akan|zulu|xhosa|afrikaans|wolof|fula|fulfulde|somali)\b/i,
  },
  {
    key: "pension",
    label: "Pension mentioned",
    pattern: /\b(?:pension|retirement\s+contribution)\b/i,
  },
  {
    key: "hmo",
    label: "HMO / health cover mentioned",
    pattern: /\b(?:hmo|health\s+insurance|medical\s+cover(?:age)?)\b/i,
  },
  {
    key: "transport",
    label: "Transport support",
    pattern:
      /\b(?:transport(?:ation)?\s+(?:allowance|support)|commut(?:e|ing)\s+(?:allowance|support))\b/i,
  },
  {
    key: "housing",
    label: "Housing support",
    pattern: /\b(?:housing|accommodation)\s+(?:allowance|support|provided)\b/i,
  },
  {
    key: "dataPowerAllowance",
    label: "Data / power allowance",
    pattern:
      /\b(?:(?:data|internet|power|electricity)\s+(?:allowance|stipend|support)|remote\s+work\s+stipend)\b/i,
  },
  {
    key: "thirteenthMonth",
    label: "13th month",
    pattern: /\b(?:13th|thirteenth)\s+month\b/i,
  },
  {
    key: "bonus",
    label: "Bonus mentioned",
    pattern: /\b(?:performance|annual|signing|discretionary)\s+bonus\b/i,
  },
  {
    key: "overtimeWeekend",
    label: "Overtime / weekend expectations",
    pattern:
      /\b(?:overtime|weekend\s+(?:work|shifts?|availability)|work(?:ing)?\s+weekends)\b/i,
  },
  {
    key: "fxPolicy",
    label: "FX policy",
    pattern:
      /\b(?:fx|foreign\s+exchange|exchange\s+rate|currency\s+conversion)\s+(?:policy|rate|adjustment|review|basis)\b/i,
  },
  {
    key: "payReliability",
    label: "Pay reliability evidence",
    pattern:
      /\b(?:paid\s+(?:on\s+time|promptly)|on-time\s+pay|salary\s+(?:is\s+)?paid\s+(?:monthly|weekly|promptly)|pay\s+date)\b/i,
  },
] as const;

export type AfricaEvidenceKey =
  (typeof africaEvidenceDefinitions)[number]["key"];

export function jobEvidenceText(job: Job) {
  return [
    job.title,
    job.description,
    job.requirements,
    job.benefits,
    job.eligibility.evidenceText,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function hasJobEvidence(job: Job, key: AfricaEvidenceKey) {
  const definition = africaEvidenceDefinitions.find((item) => item.key === key);
  return definition ? definition.pattern.test(jobEvidenceText(job)) : false;
}

export function getJobEvidenceLabels(job: Job) {
  return africaEvidenceDefinitions
    .filter((definition) => definition.pattern.test(jobEvidenceText(job)))
    .map(({ key, label }) => ({ key, label }));
}
