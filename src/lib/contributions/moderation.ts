export type AutomaticModerationFlag =
  | "pii"
  | "doxxing"
  | "threat"
  | "hate_speech"
  | "confidential_material"
  | "serious_allegation"
  | "malicious_text";

function flattenText(value: unknown, output: string[]) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => flattenText(item, output));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!key.startsWith("_")) flattenText(item, output);
    }
  }
}

/**
 * Produces codes only. Matched text is deliberately excluded so moderation
 * metadata cannot become a second store of PII, threats, or allegations.
 */
export function analyzeContributionPayload(
  payload: Record<string, unknown>,
): AutomaticModerationFlag[] {
  const values: string[] = [];
  flattenText(payload, values);
  const text = values.join(" ");
  const flags = new Set<AutomaticModerationFlag>();

  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
    /(?:\+?\d[\s()./-]*){8,}/.test(text)
  )
    flags.add("pii");
  if (
    /\b(home|residential) address\b|\bpassport number\b|\bbank verification number\b|\bnational identification number\b|\b(?:BVN|NIN)\b/i.test(
      text,
    )
  )
    flags.add("doxxing");
  if (/\b(kill|murder|bomb|shoot|stab|hurt you|burn down)\b/i.test(text))
    flags.add("threat");
  if (
    /\b(race|tribe|religion|ethnicity|nationality)\b.{0,40}\b(inferior|vermin|subhuman|animals)\b/i.test(
      text,
    )
  )
    flags.add("hate_speech");
  if (
    /\b(confidential|NDA|non-disclosure|password|secret key|exact test answer|proprietary answer)\b/i.test(
      text,
    )
  )
    flags.add("confidential_material");
  if (
    /\b(fraud|bribery|embezzlement|assault|sexual harassment|stole|theft|criminal)\b/i.test(
      text,
    )
  )
    flags.add("serious_allegation");
  if (/<script|javascript:|data:text\/html|onerror\s*=|onload\s*=/i.test(text))
    flags.add("malicious_text");

  return [...flags].sort();
}
