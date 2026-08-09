/**
 * Job context carried between product surfaces.
 *
 * Moving from a job into the pay tools used to drop everything the user had
 * already told us: they landed on an empty calculator and retyped a salary the
 * page above them was already displaying. That is what made the product feel
 * like separate pages rather than one journey.
 *
 * A small, explicitly whitelisted set of fields travels in the query string —
 * enough to prefill a calculation and to render "continuing from <role> at
 * <employer>" with a link back. Nothing sensitive travels here: no identifiers,
 * no account state, only facts already public on the job page.
 */

import type { Job, PayPeriod } from "@/lib/jobs/types";

export interface JobContext {
  /** Job slug, so every tool can link back to the exact role. */
  slug: string;
  title: string;
  company: string;
  companySlug: string | null;
  amount: number | null;
  currency: string | null;
  period: PayPeriod | null;
}

const CONTEXT_KEYS = {
  slug: "from",
  title: "role",
  company: "employer",
  companySlug: "employerSlug",
  amount: "amount",
  currency: "currency",
  period: "period",
} as const;

/**
 * Periods that may travel with the context. Offer Compare accepts all of
 * them; the monthly/annual-only calculators must check
 * `contextPeriodFitsCalculator` before prefilling, so an hourly rate never
 * silently becomes a monthly salary. "unknown" travels as no period at all.
 */
const TOOL_PERIODS = new Set<PayPeriod>([
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "annual",
]);

/** Whether the monthly/annual calculators can honestly use this period. */
export function contextPeriodFitsCalculator(
  context: JobContext | null,
): boolean {
  return (
    context !== null &&
    (context.period === null ||
      context.period === "monthly" ||
      context.period === "annual")
  );
}

const MAX_TEXT = 120;

function trimText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, MAX_TEXT);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The amount a calculator should start from. A range prefills its lower bound:
 * it is the number the candidate is most likely to be offered, and quoting the
 * top of an advertised band as if it were the offer would overstate pay.
 */
export function contextAmountFor(job: Job): number | null {
  const salary = job.salary;
  if (!salary) return null;
  const amount = salary.minimum ?? salary.maximum;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function jobContextFrom(job: Job): JobContext {
  return {
    slug: job.slug,
    title: job.title,
    company: job.company.name,
    companySlug: job.company.slug ?? null,
    amount: contextAmountFor(job),
    currency: job.salary?.currency ?? null,
    period: job.salary?.payPeriod ?? null,
  };
}

/** Serialize context onto a destination path. Empty fields are omitted. */
export function withJobContext(path: string, context: JobContext): string {
  const params = new URLSearchParams();
  params.set(CONTEXT_KEYS.slug, context.slug);
  const title = trimText(context.title);
  if (title) params.set(CONTEXT_KEYS.title, title);
  const company = trimText(context.company);
  if (company) params.set(CONTEXT_KEYS.company, company);
  if (context.companySlug) {
    params.set(CONTEXT_KEYS.companySlug, context.companySlug);
  }
  if (context.amount !== null) {
    params.set(CONTEXT_KEYS.amount, String(Math.round(context.amount)));
  }
  if (context.currency) params.set(CONTEXT_KEYS.currency, context.currency);
  if (context.period && TOOL_PERIODS.has(context.period)) {
    params.set(CONTEXT_KEYS.period, context.period);
  }
  return `${path}?${params.toString()}`;
}

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Read context back off a URL. Every field is validated, because these values
 * are rendered and used as form defaults: a slug that is not a slug never
 * becomes a link, and a non-finite amount never reaches a calculator.
 */
export function readJobContext(params: SearchParams): JobContext | null {
  const slug = single(params[CONTEXT_KEYS.slug]);
  if (!slug || !SLUG_PATTERN.test(slug)) return null;

  const companySlugRaw = single(params[CONTEXT_KEYS.companySlug]);
  const companySlug =
    companySlugRaw && SLUG_PATTERN.test(companySlugRaw) ? companySlugRaw : null;

  const amountRaw = single(params[CONTEXT_KEYS.amount]);
  const amountValue = amountRaw === null ? Number.NaN : Number(amountRaw);
  const amount =
    Number.isFinite(amountValue) && amountValue > 0 ? amountValue : null;

  const currencyRaw = single(params[CONTEXT_KEYS.currency]);
  const currency =
    currencyRaw && CURRENCY_PATTERN.test(currencyRaw) ? currencyRaw : null;

  const periodRaw = single(params[CONTEXT_KEYS.period]);
  const period =
    periodRaw && TOOL_PERIODS.has(periodRaw as PayPeriod)
      ? (periodRaw as PayPeriod)
      : null;

  return {
    slug,
    title: trimText(single(params[CONTEXT_KEYS.title])) ?? "this role",
    company: trimText(single(params[CONTEXT_KEYS.company])) ?? "this employer",
    companySlug,
    amount,
    currency,
    period,
  };
}

/**
 * Naira is the only currency the Nigeria PAYE calculator can reason about, so
 * a dollar-denominated role prefills the amount but must not imply that the
 * result is a Nigerian tax outcome for that figure.
 */
export function contextIsNairaPaye(context: JobContext | null): boolean {
  return context?.currency === "NGN" || context?.currency === null;
}

export const JOB_CONTEXT_KEYS = CONTEXT_KEYS;
