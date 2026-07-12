import type {
  BenefitKind,
  ContractArrangement,
  OfferInput,
  OfferPayPeriod,
  OfferWorkMode,
  WorkCostKind,
} from "@/lib/offers";

export type OfferPrefix = "a" | "b";

export const BENEFIT_FIELDS: ReadonlyArray<readonly [BenefitKind, string]> = [
  ["pension", "Pension value"],
  ["health", "Health insurance value"],
  ["transport", "Transport"],
  ["housing", "Housing"],
  ["lunch", "Lunch"],
  ["data", "Data"],
  ["equipment", "Equipment value"],
];

export const COST_FIELDS: ReadonlyArray<readonly [WorkCostKind, string]> = [
  ["remote_work", "Remote-work cost"],
  ["electricity", "Electricity cost"],
  ["commute", "Commute cost"],
  ["transfer", "Transfer fees"],
  ["exchange", "Exchange cost"],
];

const OFFER_PAY_PERIODS = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "annual",
] as const satisfies readonly OfferPayPeriod[];

const CONTRACT_ARRANGEMENTS = [
  "employee",
  "contractor",
  "freelance",
  "fixed_term",
  "internship",
  "other",
] as const satisfies readonly ContractArrangement[];

const WORK_MODES = [
  "remote",
  "hybrid",
  "onsite",
  "flexible",
] as const satisfies readonly OfferWorkMode[];

function fieldLabel(name: string): string {
  return name.replaceAll("_", " ");
}

function readNumber(form: FormData, name: string, optional?: false): number;
function readNumber(
  form: FormData,
  name: string,
  optional: true,
): number | undefined;
function readNumber(form: FormData, name: string, optional = false) {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "") {
    if (optional) return undefined;
    throw new Error(`${fieldLabel(name)} is required.`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldLabel(name)} must be a non-negative number.`);
  }
  return value;
}

function readCurrency(form: FormData, name: string): string {
  const currency = String(form.get(name) ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      `${fieldLabel(name)} must use a three-letter currency code.`,
    );
  }
  return currency;
}

function readEnum<const Options extends readonly string[]>(
  form: FormData,
  name: string,
  options: Options,
): Options[number] {
  const value = String(form.get(name) ?? "");
  const selected = options.find((option) => option === value);
  if (selected === undefined) {
    throw new Error(`${fieldLabel(name)} has an invalid value.`);
  }
  return selected;
}

function readValuedFields<Kind extends string>(
  form: FormData,
  prefix: OfferPrefix,
  fields: ReadonlyArray<readonly [Kind, string]>,
): Array<{ kind: Kind; amount: number }> {
  return fields.flatMap(([kind]) => {
    const amount = readNumber(form, `${prefix}_${kind}`, true);
    return amount !== undefined && amount > 0 ? [{ kind, amount }] : [];
  });
}

/**
 * Converts one offer fieldset into the domain input expected by the API.
 * Every user-controlled enum and required scalar is checked at this boundary;
 * callers never need to cast arbitrary FormData values to domain types.
 */
export function buildOfferFromForm(
  form: FormData,
  prefix: OfferPrefix,
): OfferInput {
  const currency = readCurrency(form, `${prefix}_currency`);
  const basePeriod = readEnum(form, `${prefix}_period`, OFFER_PAY_PERIODS);
  const periodsPerYear = readNumber(form, `${prefix}_periods_per_year`, true);
  const bonus = readNumber(form, `${prefix}_bonus`, true);
  const commission = readNumber(form, `${prefix}_commission`, true);
  const deduction = readNumber(form, `${prefix}_deductions`, true);
  const benefits = readValuedFields(form, prefix, BENEFIT_FIELDS);
  const costs = readValuedFields(form, prefix, COST_FIELDS);
  const equipment = String(form.get(`${prefix}_equipment_list`) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    id: prefix,
    label: String(
      form.get(`${prefix}_label`) || `Offer ${prefix.toUpperCase()}`,
    ),
    basePay: {
      amount: readNumber(form, `${prefix}_base`),
      currency,
      payPeriod: basePeriod,
      ...(periodsPerYear !== undefined && periodsPerYear > 0
        ? { periodsPerYear }
        : {}),
    },
    payBasis: readEnum(form, `${prefix}_basis`, ["gross", "net"] as const),
    variablePay: [
      ...(bonus !== undefined && bonus > 0
        ? [
            {
              kind: "bonus" as const,
              value: { amount: bonus, currency, payPeriod: "annual" as const },
              guaranteed: form.get(`${prefix}_bonus_guaranteed`) === "on",
            },
          ]
        : []),
      ...(commission !== undefined && commission > 0
        ? [
            {
              kind: "commission" as const,
              value: {
                amount: commission,
                currency,
                payPeriod: "annual" as const,
              },
              guaranteed: false,
            },
          ]
        : []),
    ],
    benefits: benefits.map(({ kind, amount }) => ({
      kind,
      value: { amount, currency, payPeriod: "monthly" },
    })),
    personalCosts: costs.map(({ kind, amount }) => ({
      kind,
      value: { amount, currency, payPeriod: "monthly" },
    })),
    ...(deduction === undefined
      ? {}
      : {
          estimatedDeductions:
            deduction > 0
              ? [
                  {
                    label: "User-entered estimated deductions",
                    value: {
                      amount: deduction,
                      currency,
                      payPeriod: "monthly" as const,
                    },
                  },
                ]
              : [],
        }),
    terms: {
      arrangement: readEnum(
        form,
        `${prefix}_arrangement`,
        CONTRACT_ARRANGEMENTS,
      ),
      workMode: readEnum(form, `${prefix}_work_mode`, WORK_MODES),
      paidLeaveDays: readNumber(form, `${prefix}_leave`, true),
      equipmentProvided: equipment,
      commuteHoursPerWeek: readNumber(form, `${prefix}_commute_hours`, true),
      contractTermMonths: readNumber(form, `${prefix}_contract_months`, true),
      noticePeriodDays: readNumber(form, `${prefix}_notice_days`, true),
    },
  };
}
