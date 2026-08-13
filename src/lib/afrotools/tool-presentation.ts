import type { AfroToolsCatalogTool } from "./catalog";

export type CareerMomentId = "prepare" | "understand_pay" | "choose" | "grow";
export type CareerToolDestination = "salarypadi" | "afrotools";

export interface PresentedCareerTool {
  id: string;
  /** Null only for a native SalaryPadi tool that is not provider catalog data. */
  catalogId: string | null;
  source: "afrotools_catalog" | "salarypadi_native";
  moment: CareerMomentId;
  title: string;
  description: string;
  href: string;
  destination: CareerToolDestination;
  disclosure: "Runs in SalaryPadi" | "Opens AfroTools";
  actionLabel: string;
}

export interface CareerToolMoment {
  id: CareerMomentId;
  eyebrow: string;
  title: string;
  description: string;
  tools: PresentedCareerTool[];
}

const localRoutes = {
  "ng-paye": "/tools/take-home-pay",
  "currency-converter": "/tools/salary-converter",
  "job-offer-evaluator": "/tools/offer-compare",
  // SalaryPadi already publishes moderated, privacy-thresholded salary evidence
  // on /salaries. Keep that evidence journey local; the broader cross-market
  // comparator remains an AfroTools destination because it is a distinct task.
  "salary-intelligence": "/salaries",
} as const;

const localToolDefinitions: Record<
  keyof typeof localRoutes,
  { moment: CareerMomentId; title: string; description: string }
> = {
  "ng-paye": {
    moment: "understand_pay",
    title: "Understand your Nigeria take-home pay",
    description:
      "Estimate deductions with the rule date and assumptions kept visible.",
  },
  "currency-converter": {
    moment: "understand_pay",
    title: "Compare salary values across currencies",
    description:
      "Convert a stated amount without hiding the rate source or date.",
  },
  "job-offer-evaluator": {
    moment: "choose",
    title: "Compare two job offers",
    description:
      "Put salary, benefits, work costs and career trade-offs side by side.",
  },
  "salary-intelligence": {
    moment: "understand_pay",
    title: "Explore salary evidence by role and country",
    description:
      "Review SalaryPadi's available pay evidence with its cohort, source and limitations.",
  },
};

const moments: readonly Omit<CareerToolMoment, "tools">[] = [
  {
    id: "prepare",
    eyebrow: "Before you apply",
    title: "Prepare and check the opportunity",
    description:
      "Strengthen your application, investigate warning signs and get ready for the interview.",
  },
  {
    id: "understand_pay",
    eyebrow: "When you see the pay",
    title: "Work out what the money means",
    description:
      "Put the salary, currency, deductions and employment rules into useful context.",
  },
  {
    id: "choose",
    eyebrow: "When an offer arrives",
    title: "Compare and negotiate the offer",
    description:
      "See the trade-offs you will actually feel before you accept or counter.",
  },
  {
    id: "grow",
    eyebrow: "For the next move",
    title: "Plan beyond this role",
    description:
      "Explore a career change, growth path, pension or longer-term savings scenario.",
  },
] as const;

const toolMoments: Record<string, CareerMomentId> = {
  "cv-builder": "prepare",
  "interview-prep": "prepare",
  "ng-paye": "understand_pay",
  "currency-converter": "understand_pay",
  "salary-compare": "understand_pay",
  "salary-intelligence": "understand_pay",
  "minimum-wage": "understand_pay",
  "overtime-calc": "understand_pay",
  "leave-calculator": "understand_pay",
  "job-offer-evaluator": "choose",
  "salary-negotiation": "choose",
  "pension-projection": "grow",
  "career-switch": "grow",
  "career-growth": "grow",
  "retirement-readiness": "grow",
};

const outcomes: Record<string, { title: string; description: string }> = {
  "ng-paye": {
    title: "Understand your Nigeria take-home pay",
    description:
      "Estimate deductions with the rule date and assumptions kept visible.",
  },
  "cv-builder": {
    title: "Build an Africa-ready CV",
    description:
      "Create a structured CV that makes local education and experience clear.",
  },
  "currency-converter": {
    title: "Compare salary values across currencies",
    description:
      "Convert a stated amount without hiding the rate source or date.",
  },
  "salary-compare": {
    title: "Compare a role across African markets",
    description:
      "Explore country and role context before treating any figure as a benchmark.",
  },
  "salary-intelligence": {
    title: "Explore salary evidence by role and country",
    description:
      "Review SalaryPadi's available pay evidence with its cohort, source and limitations.",
  },
  "minimum-wage": {
    title: "Check the applicable minimum wage",
    description:
      "Find supported country and sector references before assessing an offer.",
  },
  "overtime-calc": {
    title: "Estimate overtime pay",
    description:
      "Test overtime hours against supported country rules and source dates.",
  },
  "leave-calculator": {
    title: "Understand leave entitlements",
    description:
      "Review annual, sick and family-leave references for supported countries.",
  },
  "pension-projection": {
    title: "Project pension growth",
    description:
      "Explore how contributions and time could affect a retirement balance.",
  },
  "job-offer-evaluator": {
    title: "Compare two job offers",
    description:
      "Put salary, benefits, work costs and career trade-offs side by side.",
  },
  "interview-prep": {
    title: "Prepare for an interview",
    description:
      "Build a practical checklist around the role and company context.",
  },
  "career-switch": {
    title: "Plan the cost of a career switch",
    description:
      "Estimate retraining cost, foregone income and a possible break-even point.",
  },
  "career-growth": {
    title: "Map a career-growth scenario",
    description:
      "Explore promotion and pay milestones as scenarios, not promises.",
  },
  "salary-negotiation": {
    title: "Prepare a salary negotiation",
    description:
      "Structure a counter-offer around pay, benefits and evidence you can defend.",
  },
  "retirement-readiness": {
    title: "Check retirement readiness",
    description:
      "Compare current saving assumptions with a longer-term target.",
  },
};

/**
 * The scam checker is SalaryPadi-owned and intentionally absent from the
 * provider catalog. Keeping this definition separate prevents the UI from
 * implying AfroTools reviewed, supplied or runs the checker.
 */
export const NATIVE_SCAM_CHECKER: PresentedCareerTool = {
  id: "salarypadi-job-scam-checker",
  catalogId: null,
  source: "salarypadi_native",
  moment: "prepare",
  title: "Check a vacancy for warning signs",
  description:
    "Run an explainable, local-only screen without opening submitted links or declaring an employer fraudulent.",
  href: "/tools/job-scam-checker",
  destination: "salarypadi",
  disclosure: "Runs in SalaryPadi",
  actionLabel: "Check warning signs",
};

/**
 * SalaryPadi routes remain discoverable even when the provider catalog is not
 * currently usable. They are first-party product capabilities, not claims
 * about the current external catalog. Provider destinations still fail closed.
 */
export const LOCAL_SALARYPADI_TOOLS: PresentedCareerTool[] = Object.entries(
  localRoutes,
).map(([id, href]) => {
  const localId = id as keyof typeof localRoutes;
  const definition = localToolDefinitions[localId];
  return {
    id: localId,
    catalogId: null,
    source: "salarypadi_native" as const,
    moment: definition.moment,
    title: definition.title,
    description: definition.description,
    href,
    destination: "salarypadi" as const,
    disclosure: "Runs in SalaryPadi" as const,
    actionLabel: "Use in SalaryPadi",
  };
});

function fallbackMoment(tool: AfroToolsCatalogTool): CareerMomentId {
  if (tool.category_key === "career") return "grow";
  if (
    tool.category_key === "education" ||
    tool.category_key === "document-pdf"
  ) {
    return "prepare";
  }
  return "understand_pay";
}

export function presentCareerTool(
  tool: AfroToolsCatalogTool,
): PresentedCareerTool {
  const route = localRoutes[tool.id as keyof typeof localRoutes];
  const destination: CareerToolDestination = route ? "salarypadi" : "afrotools";
  const outcome = outcomes[tool.id] ?? {
    title: tool.name,
    description:
      "Continue to the reviewed AfroTools destination for this career task.",
  };
  return {
    ...outcome,
    id: tool.id,
    catalogId: tool.id,
    source: "afrotools_catalog",
    moment: toolMoments[tool.id] ?? fallbackMoment(tool),
    href:
      route ??
      tool.canonical_url ??
      new URL(tool.url, "https://afrotools.com").toString(),
    destination,
    disclosure:
      destination === "salarypadi" ? "Runs in SalaryPadi" : "Opens AfroTools",
    actionLabel:
      destination === "salarypadi" ? "Use in SalaryPadi" : "Open on AfroTools",
  };
}

export function groupCareerTools(
  tools: AfroToolsCatalogTool[],
  options: { catalogAvailable?: boolean } = {},
) {
  const catalogAvailable = options.catalogAvailable ?? true;
  const presented = catalogAvailable
    ? [NATIVE_SCAM_CHECKER, ...tools.map(presentCareerTool)]
    : [NATIVE_SCAM_CHECKER, ...LOCAL_SALARYPADI_TOOLS];
  const groupedMoments: CareerToolMoment[] = moments.flatMap((moment) => {
    const momentTools = presented.filter((tool) => tool.moment === moment.id);
    return momentTools.length > 0 ? [{ ...moment, tools: momentTools }] : [];
  });
  return {
    moments: groupedMoments,
    inside: presented.filter((tool) => tool.destination === "salarypadi"),
    external: presented.filter((tool) => tool.destination === "afrotools"),
  };
}
