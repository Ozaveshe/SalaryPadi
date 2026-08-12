/**
 * The four product surfaces.
 *
 * SalaryPadi is one career-decision journey, not a directory of pages. Every
 * route belongs to exactly one surface, and this module is the single source
 * of truth for that mapping: the header, the mobile drawer, the footer and the
 * navigation tests all read from here, so a route can never appear in one
 * navigation and be missing from another.
 *
 * Surfaces are ordered by the journey itself — discover a role, research the
 * employer, work out what the money means, then keep track of it.
 */

export type SurfaceId = "jobs" | "companies" | "pay" | "career";

export interface SurfaceLink {
  href: string;
  label: string;
  /** Shown in surface landing pages and the mobile drawer, not in the header. */
  description?: string;
  /** Personal surfaces still render for signed-out visitors, with a sign-in prompt. */
  requiresAccount?: boolean;
}

export interface ProductSurface {
  id: SurfaceId;
  label: string;
  href: string;
  /** One line of consumer language. Never ingestion or engineering vocabulary. */
  summary: string;
  links: SurfaceLink[];
}

export const PRODUCT_SURFACES: readonly ProductSurface[] = [
  {
    id: "jobs",
    label: "Jobs",
    href: "/jobs",
    summary: "Roles you can actually apply for, with the evidence shown.",
    links: [
      { href: "/jobs", label: "Search all jobs" },
      {
        href: "/jobs/nigeria",
        label: "Jobs in Nigeria",
        description: "Roles based in Nigeria.",
      },
      {
        href: "/jobs/remote",
        label: "Remote jobs open to Nigerians",
        description: "Remote roles whose wording names Nigeria or Africa.",
      },
      {
        href: "/jobs/graduate",
        label: "Graduate and entry level",
      },
      { href: "/jobs/visa-sponsorship", label: "Visa sponsorship" },
      { href: "/jobs/ngo", label: "NGO and development" },
      {
        href: "/matches",
        label: "Recommended for you",
        requiresAccount: true,
      },
    ],
  },
  {
    id: "companies",
    label: "Companies",
    href: "/companies",
    summary: "What an employer pays, how they hire, and who verified it.",
    links: [
      { href: "/companies", label: "All employers" },
      {
        href: "/companies?hiring=true",
        label: "Employers hiring now",
      },
      {
        href: "/blog",
        label: "Career guides and insights",
        description: "Evidence-led guidance and current market context.",
      },
    ],
  },
  {
    id: "pay",
    label: "Pay & Offers",
    href: "/salaries",
    summary: "What a role is worth, and what you would actually take home.",
    links: [
      {
        href: "/salaries",
        label: "Salary explorer",
        description: "Pay ranges by role and country.",
      },
      {
        href: "/tools/take-home-pay",
        label: "Take-home pay calculator",
        description: "Nigeria PAYE, gross to net.",
      },
      {
        href: "/tools/offer-compare",
        label: "Compare two offers",
      },
      { href: "/tools/salary-converter", label: "Salary converter" },
      {
        href: "/tools/job-scam-checker",
        label: "Job scam checker",
        description: "Screen a vacancy before you apply.",
      },
    ],
  },
  {
    id: "career",
    label: "My Career",
    href: "/dashboard",
    summary: "Saved roles, applications, alerts and your contributions.",
    links: [
      { href: "/dashboard", label: "Career dashboard", requiresAccount: true },
      { href: "/saved", label: "Saved jobs", requiresAccount: true },
      {
        href: "/applications",
        label: "Application tracker",
        requiresAccount: true,
      },
      { href: "/alerts", label: "Job alerts", requiresAccount: true },
      {
        href: "/contribute",
        label: "Contribute what you know",
        description: "Salary, interview and pay-reliability reports.",
      },
      { href: "/account", label: "Account and privacy", requiresAccount: true },
    ],
  },
] as const;

/** Header navigation: one entry per surface, nothing else. */
export function primaryNavigation(): readonly {
  href: string;
  label: string;
  id: SurfaceId;
}[] {
  return PRODUCT_SURFACES.map((surface) => ({
    href: surface.href,
    label: surface.label,
    id: surface.id,
  }));
}

/**
 * Which surface a pathname belongs to, for active-state highlighting and for
 * analytics attribution. Longest prefix wins so `/tools/take-home-pay` resolves
 * to Pay & Offers rather than falling through to null.
 */
const SURFACE_PREFIXES: readonly { prefix: string; id: SurfaceId }[] = [
  { prefix: "/jobs", id: "jobs" },
  { prefix: "/matches", id: "jobs" },
  { prefix: "/guides", id: "jobs" },
  { prefix: "/companies", id: "companies" },
  { prefix: "/company-intelligence", id: "companies" },
  { prefix: "/insights", id: "companies" },
  { prefix: "/blog", id: "companies" },
  { prefix: "/salaries", id: "pay" },
  { prefix: "/tools", id: "pay" },
  { prefix: "/dashboard", id: "career" },
  { prefix: "/saved", id: "career" },
  { prefix: "/applications", id: "career" },
  { prefix: "/alerts", id: "career" },
  { prefix: "/notifications", id: "career" },
  { prefix: "/contribute", id: "career" },
  { prefix: "/account", id: "career" },
];

export function surfaceForPath(pathname: string): SurfaceId | null {
  const match = SURFACE_PREFIXES.filter(
    (entry) =>
      pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  ).toSorted((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.id ?? null;
}
