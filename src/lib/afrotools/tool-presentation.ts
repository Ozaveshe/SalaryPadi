import type { AfroToolsCatalogTool } from "./catalog";

const localRoutes = {
  "ng-paye": "/tools/take-home-pay",
  "currency-converter": "/tools/salary-converter",
} as const;

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
    title: "Explore salary evidence by role and city",
    description:
      "Review available pay evidence with its scope and limitations.",
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

export function presentCareerTool(tool: AfroToolsCatalogTool) {
  const route = localRoutes[tool.id as keyof typeof localRoutes];
  const outcome = outcomes[tool.id] ?? {
    title: tool.name,
    description:
      "Continue to the reviewed AfroTools destination for this career task.",
  };
  return {
    ...outcome,
    id: tool.id,
    kind: route ? ("inside" as const) : ("external" as const),
    href:
      route ??
      tool.canonical_url ??
      new URL(tool.url, "https://afrotools.com").toString(),
  };
}

export function groupCareerTools(tools: AfroToolsCatalogTool[]) {
  const presented = tools.map(presentCareerTool);
  return {
    inside: presented.filter((tool) => tool.kind === "inside"),
    external: presented.filter((tool) => tool.kind === "external"),
  };
}
