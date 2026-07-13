import { FLAG_DEFINITIONS, PERSONAL_EMAIL_DOMAINS } from "./definitions";
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
  safetyWarningIsNegated,
  splitIntoStatements,
  unique,
  type ExtractedUrl,
} from "./signals";
import type {
  ScamCheckInput,
  ScamCheckResult,
  ScamFlagCode,
  ScamFlagSource,
  ScamRiskTier,
  ScamWarningFlag,
} from "./types";

function mergeSource(
  existing: ScamFlagSource,
  incoming: ScamFlagSource,
): ScamFlagSource {
  return existing === incoming ? existing : "both";
}

function riskDetails(flags: readonly ScamWarningFlag[]): {
  tier: ScamRiskTier;
  label: string;
  summary: string;
} {
  const highCount = flags.filter((flag) => flag.severity === "high").length;
  const tier: ScamRiskTier =
    highCount > 0 || flags.length >= 4
      ? "high_caution"
      : flags.length > 0
        ? "caution"
        : "lower_indication";

  if (tier === "high_caution") {
    return {
      tier,
      label: "High caution",
      summary:
        "One or more serious warning signs need independent verification before you pay, share sensitive data, or continue. This automated result does not prove fraud.",
    };
  }
  if (tier === "caution") {
    return {
      tier,
      label: "Caution",
      summary:
        "Some details deserve independent verification before you continue. These signs can have legitimate explanations and do not prove fraud.",
    };
  }
  return {
    tier,
    label: "Lower indication from supplied information",
    summary:
      "No listed warning sign was detected in the information supplied. This is not a safety guarantee or proof that the vacancy is legitimate.",
  };
}

/**
 * Performs a deterministic, local-only analysis. It parses URL and email text
 * but never opens a link, resolves DNS, or makes a network request.
 */
export function checkJobScam(input: ScamCheckInput): ScamCheckResult {
  const text = input.vacancyText?.trim() ?? "";
  const answers = input.answers ?? {};
  const statements = splitIntoStatements(text);
  const mutableFlags = new Map<ScamFlagCode, ScamWarningFlag>();
  const addFlag = (
    code: ScamFlagCode,
    source: ScamFlagSource,
    evidence: string,
  ) => {
    const definition = FLAG_DEFINITIONS[code];
    const existing = mutableFlags.get(code);
    if (existing) {
      existing.source = mergeSource(existing.source, source);
      existing.evidence = unique([
        ...existing.evidence,
        evidenceSnippet(evidence),
      ]);
      return;
    }
    mutableFlags.set(code, {
      code,
      severity: definition.severity,
      title: definition.title,
      whyItMatters: definition.whyItMatters,
      evidence: [evidenceSnippet(evidence)],
      source,
      verificationSteps: definition.verificationSteps,
    });
  };

  const trainingFeeEvidence = findStatement(
    statements,
    [
      /\b(?:training|equipment|laptop|software|starter kit)\b.{0,45}\b(?:fee|deposit|payment)\b/i,
      /\b(?:must|required to|need to)\s+(?:pay|buy|purchase)\b.{0,45}\b(?:training|equipment|laptop|software|starter kit)\b/i,
      /\b(?:pay|buy|purchase)\b.{0,45}\b(?:training|equipment|laptop|software|starter kit)\b.{0,35}\b(?:before|to start|from (?:us|our)|approved seller)\b/i,
    ],
    feeIsNegated,
  );
  if (trainingFeeEvidence) {
    addFlag("training_or_equipment_fee", "text", trainingFeeEvidence);
  }

  const genericFeeEvidence =
    findStatement(
      statements,
      [
        /\b(?:application|registration|processing|onboarding|administrative|security|logistics)\s+(?:fee|deposit|payment)\b/i,
        /\b(?:upfront|advance)\s+(?:fee|payment|deposit)\b/i,
        /\b(?:fee|deposit)\s+(?:is\s+)?(?:required|mandatory|payable|upfront)\b/i,
        /\bpay\b.{0,35}\b(?:application|registration|processing|onboarding)\b/i,
        /\b(?:make you|you (?:go|gats?|suppose)|abeg)\b.{0,40}\b(?:pay|send|transfer|remit|drop)\b.{0,45}\b(?:registration|processing|logistics)\b.{0,20}\b(?:money|fee|payment)\b/i,
        /\b(?:pay|send|transfer|remit|drop)\b.{0,30}\b(?:₦\s*)?\d[\d,]*(?:k|000)?\b.{0,30}\b(?:registration|processing|logistics)\b/i,
      ],
      (statement) =>
        feeIsNegated(statement) || statement === trainingFeeEvidence,
    ) ??
    statements
      .filter(
        (statement) =>
          statement !== trainingFeeEvidence && !feeIsNegated(statement),
      )
      .find((statement) => feeRequestInTokenWindow(statement)) ??
    null;
  if (genericFeeEvidence) {
    addFlag("upfront_payment", "text", genericFeeEvidence);
  }

  if (answers.feeRequested === true) {
    const isTrainingOrEquipment =
      answers.feePurpose === "training" || answers.feePurpose === "equipment";
    addFlag(
      isTrainingOrEquipment ? "training_or_equipment_fee" : "upfront_payment",
      "answers",
      isTrainingOrEquipment
        ? `You answered that a ${answers.feePurpose} payment was requested.`
        : "You answered that a recruitment payment was requested.",
    );
  }

  const textEmails = extractEmails(text);
  const enteredEmail = answers.recruiterEmail?.trim();
  const emailCandidates = unique([
    ...(enteredEmail ? [enteredEmail] : []),
    ...textEmails,
  ]);
  emailCandidates.forEach((email) => {
    const domain = normalizeDomain(email);
    if (!domain || !PERSONAL_EMAIL_DOMAINS.has(domain)) return;
    const source: ScamFlagSource =
      enteredEmail?.toLowerCase() === email.toLowerCase() ? "answers" : "text";
    const statement = statements.find((item) => item.includes(email));
    if (
      source === "text" &&
      statement &&
      /\b(?:never|do not|does not|will not|won't)\b.{0,35}\b(?:email|use|contact)\b/i.test(
        statement,
      )
    ) {
      return;
    }
    addFlag(
      "personal_email_domain",
      source,
      source === "answers"
        ? `The entered recruiter email uses ${domain}.`
        : `A contact email in the pasted text uses ${domain}.`,
    );
  });

  const officialDomain = normalizeDomain(answers.officialEmployerDomain);
  const trustedDomains = unique(
    (answers.trustedApplicationDomains ?? [])
      .map((domain) => normalizeDomain(domain))
      .filter((domain): domain is string => domain !== null),
  );
  const extractedUrls = extractUrls(statements);
  const enteredApplicationDomain = normalizeDomain(answers.applicationUrl);
  const domainCandidates = unique([
    ...emailCandidates
      .map((email) => normalizeDomain(email))
      .filter((domain): domain is string => domain !== null),
    ...(enteredApplicationDomain ? [enteredApplicationDomain] : []),
    ...extractedUrls.map((url) => url.domain),
  ]);

  if (answers.domainAppearsMisspelled === true) {
    addFlag(
      "suspicious_domain",
      "answers",
      "You answered that a contact or link domain appears misspelled.",
    );
  }
  if (
    answers.applicationUrl?.toLowerCase().includes("xn--") ||
    answers.recruiterEmail?.toLowerCase().includes("xn--") ||
    /\bxn--[a-z\d-]+(?:\.[a-z\d-]+)+/i.test(text)
  ) {
    addFlag(
      "suspicious_domain",
      answers.applicationUrl?.toLowerCase().includes("xn--") ||
        answers.recruiterEmail?.toLowerCase().includes("xn--")
        ? "answers"
        : "text",
      "An internationalised domain form was supplied and should be checked character by character.",
    );
  }
  domainCandidates.forEach((domain) => {
    if (domain.includes("xn--")) {
      addFlag(
        "suspicious_domain",
        domain === enteredApplicationDomain ? "answers" : "text",
        `The domain ${domain} uses an internationalised form that should be checked character by character.`,
      );
      return;
    }
    if (officialDomain && couldBeLookalike(domain, officialDomain)) {
      const source: ScamFlagSource =
        domain === enteredApplicationDomain ||
        domain === normalizeDomain(enteredEmail)
          ? "answers"
          : "text";
      addFlag(
        "suspicious_domain",
        source,
        `${domain} is close to, but not the same as, the entered official domain ${officialDomain}.`,
      );
    }
  });

  const messagingEvidence = findStatement(
    statements,
    [
      /\b(?:interview|assessment)\b.{0,55}\b(?:whatsapp|telegram|signal|text|chat|messag\w*)\b.{0,25}\b(?:only|exclusively|no (?:call|video|voice))\b/i,
      /\b(?:whatsapp|telegram|signal|text|chat|messag\w*)[- ]?only\b.{0,35}\b(?:interview|assessment)\b/i,
      /\b(?:only|exclusively)\b.{0,25}\b(?:whatsapp|telegram|signal|text|chat)\b.{0,35}\b(?:interview|assessment)\b/i,
      /\b(?:interview|assessment)\b.{0,35}\bna\s+only\b.{0,20}\b(?:whatsapp|telegram|chat|message)\b/i,
      /\bna\s+(?:whatsapp|telegram|chat|message)\b.{0,30}\b(?:we|dem)\s+go\s+(?:use|take)\b.{0,20}\b(?:do|conduct)\s+(?:the\s+)?(?:interview|assessment)\b/i,
    ],
    safetyWarningIsNegated,
  );
  if (messagingEvidence) {
    addFlag("messaging_only_interview", "text", messagingEvidence);
  }
  if (answers.interviewChannel === "messaging_only") {
    addFlag(
      "messaging_only_interview",
      "answers",
      "You answered that the interview is messaging-only.",
    );
  }

  // Deliberately never infer unrealistic compensation from a number in text.
  if (answers.compensationSeemsUnrealistic === true) {
    addFlag(
      "unrealistic_compensation",
      "answers",
      "You explicitly marked the stated compensation as unrealistic.",
    );
  }

  const vagueEmployerEvidence = findStatement(statements, [
    /\b(?:confidential|unnamed|undisclosed)\s+(?:company|employer|client|organisation|organization)\b/i,
    /\b(?:cannot|can't|unable to|will not)\s+(?:name|disclose|identify)\s+(?:the\s+)?(?:company|employer|client)\b/i,
  ]);
  if (vagueEmployerEvidence) {
    addFlag("vague_employer_identity", "text", vagueEmployerEvidence);
  }
  if (answers.employerIdentityIsClear === false) {
    addFlag(
      "vague_employer_identity",
      "answers",
      "You answered that the employer's identity is unclear.",
    );
  }

  const instantOfferEvidence = findStatement(statements, [
    /\b(?:instant|immediate)\s+(?:job\s+)?offer\b/i,
    /\b(?:you are|you're|you have been|you've been)\s+(?:hired|selected|accepted)\b.{0,55}\b(?:without|no)\s+(?:an?\s+)?(?:interview|assessment|test)\b/i,
    /\b(?:no|without)\s+(?:an?\s+)?(?:interview|assessment|test)\s+(?:is\s+)?required\b/i,
    /\bno\s+(?:interview|assessment|test)(?:\s+or\s+(?:interview|assessment|test))+\s+(?:is\s+)?required\b/i,
  ]);
  if (instantOfferEvidence) {
    addFlag("instant_offer", "text", instantOfferEvidence);
  }
  if (answers.offerMadeWithoutAssessment === true) {
    addFlag(
      "instant_offer",
      "answers",
      "You answered that an offer was made without an interview or assessment.",
    );
  }

  const bankingEvidence = findStatement(
    statements,
    [
      /\b(?:send|share|provide|enter|give|submit)\b.{0,55}\b(?:bank(?:ing)?\s+(?:login|password|credentials|details)|account\s+(?:password|login)|pin|otp|cvv|card\s+number|bvn)\b/i,
      /\b(?:bank(?:ing)?\s+(?:login|password|credentials)|pin|otp|cvv)\b.{0,45}\b(?:required|needed|send|share|provide|enter)\b/i,
    ],
    safetyWarningIsNegated,
  );
  if (bankingEvidence) {
    addFlag("banking_credentials", "text", bankingEvidence);
  }
  if (answers.bankingCredentialsRequested === true) {
    addFlag(
      "banking_credentials",
      "answers",
      "You answered that banking credentials or security information were requested.",
    );
  }

  const identityEvidence = findStatement(
    statements,
    [
      /\b(?:to apply|before (?:an?\s+)?interview|immediately|within \d+ hours?)\b.{0,65}\b(?:passport|national id|identity document|nin|driver'?s licence|driver'?s license)\b/i,
      /\b(?:send|share|provide|upload|submit)\b.{0,50}\b(?:passport|national id|identity document|nin|driver'?s licence|driver'?s license)\b.{0,35}\b(?:to apply|before (?:an?\s+)?interview|immediately)\b/i,
    ],
    safetyWarningIsNegated,
  );
  if (identityEvidence) {
    addFlag("unnecessary_identity_documents", "text", identityEvidence);
  }
  if (answers.unnecessaryIdentityDocumentsRequested === true) {
    addFlag(
      "unnecessary_identity_documents",
      "answers",
      "You answered that unnecessary or too-early identity documents were requested.",
    );
  }

  const cryptocurrencyEvidence = findStatement(
    statements,
    [
      /\b(?:salary|pay|payment|deposit|fee|purchase|send|receive|transfer|drop|fund)\b.{0,45}\b(?:bitcoin|btc|ethereum|eth|usdt|cryptocurrency|crypto|wallet address)\b/i,
      /\b(?:bitcoin|btc|ethereum|eth|usdt|cryptocurrency|crypto|wallet address)\b.{0,45}\b(?:salary|pay|payment|deposit|fee|purchase|send|receive)\b/i,
    ],
    safetyWarningIsNegated,
  );
  if (cryptocurrencyEvidence) {
    addFlag("cryptocurrency_request", "text", cryptocurrencyEvidence);
  }
  if (answers.cryptocurrencyRequested === true) {
    addFlag(
      "cryptocurrency_request",
      "answers",
      "You answered that a cryptocurrency payment, transfer, or wallet action was requested.",
    );
  }

  const urgencyEvidence = findStatement(
    statements,
    [
      /\b(?:act now|respond immediately|reply immediately|do not delay|limited slots?|offer expires today|last chance)\b/i,
      /\b(?:within|in the next)\s+\d{1,2}\s+hours?\b/i,
      /\b(?:pay|send|submit|share)\b.{0,75}\b(?:immediately|right now|before time runs out)\b/i,
      /\b(?:do am|send am|pay am|reply|respond|pay|send|transfer)\b.{0,45}\bsharp[\s-]+sharp\b/i,
      /\b(?:before|else)\b.{0,35}\b(?:slot|position|work)\b.{0,20}\b(?:go finish|go close|commot)\b/i,
    ],
    safetyWarningIsNegated,
  );
  if (urgencyEvidence) {
    addFlag("urgency_pressure", "text", urgencyEvidence);
  }
  if (answers.pressureOrUrgency === true) {
    addFlag(
      "urgency_pressure",
      "answers",
      "You answered that the recruiter used pressure or unusual urgency.",
    );
  }

  const applicationUrls: ExtractedUrl[] = [...extractedUrls].filter((url) =>
    /\b(?:apply|application|submit (?:your|an?) application)\b/i.test(
      url.statement,
    ),
  );
  if (answers.applicationUrl && enteredApplicationDomain) {
    applicationUrls.unshift({
      raw: answers.applicationUrl,
      domain: enteredApplicationDomain,
      statement: "The entered application URL",
    });
  }

  if (answers.applicationLinkRelatedToEmployer === false) {
    addFlag(
      "unrelated_application_link",
      "answers",
      "You answered that the application link is unrelated to the employer.",
    );
  }
  if (officialDomain) {
    applicationUrls.forEach((url) => {
      const isTrusted = [officialDomain, ...trustedDomains].some((domain) =>
        isSameOrSubdomain(url.domain, domain),
      );
      const explicitlyConfirmed =
        answers.applicationLinkRelatedToEmployer === true &&
        url.domain === enteredApplicationDomain;
      if (
        !isTrusted &&
        !explicitlyConfirmed &&
        !couldBeLookalike(url.domain, officialDomain)
      ) {
        addFlag(
          "unrelated_application_link",
          url.domain === enteredApplicationDomain ? "answers" : "text",
          `${url.domain} is not the entered official domain ${officialDomain} or a user-confirmed application domain.`,
        );
      }
    });
  }

  const flags = [...mutableFlags.values()];
  const risk = riskDetails(flags);
  const verificationSteps = unique([
    "Find the employer's official website independently instead of relying on supplied links.",
    "Confirm the vacancy and recruiter through an official employer contact before sharing money or sensitive data.",
    ...flags.flatMap((flag) => flag.verificationSteps),
  ]);
  const sensitiveFlagPresent = flags.some((flag) =>
    [
      "upfront_payment",
      "training_or_equipment_fee",
      "banking_credentials",
      "unnecessary_identity_documents",
      "cryptocurrency_request",
    ].includes(flag.code),
  );

  return {
    riskTier: risk.tier,
    riskLabel: risk.label,
    summary: risk.summary,
    flags,
    verificationSteps,
    safeNextActions: [
      "Pause before paying, installing software, opening an account, or sharing sensitive documents.",
      "Use contact details you found independently to verify the employer, role, recruiter, and application destination.",
      "Keep the vacancy, messages, email headers, links, payment instructions, and written offer as evidence.",
      ...(sensitiveFlagPresent
        ? [
            "If money or credentials were already shared, contact the relevant bank or service immediately through its official support channel.",
          ]
        : []),
    ],
    limitations: [
      "This is an automated warning-sign check, not a determination that an employer is legitimate or fraudulent.",
      "The checker parses domains locally and does not open, fetch, follow, or verify any URL.",
      "Missing or inaccurate answers can change the result.",
      "Compensation is flagged only when the user explicitly marks it as unrealistic; SalaryPadi does not invent a market comparison.",
    ],
    inputCoverage: {
      textAnalyzed: text.length > 0,
      structuredAnswersProvided: Object.values(answers).filter(
        (value) => value !== undefined,
      ).length,
      urlFetchPerformed: false,
    },
  };
}
