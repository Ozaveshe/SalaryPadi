import { z } from "zod";

import {
  callAfroTools,
  invalidAfroToolsResponse,
  logAfroToolsFallback,
} from "@/lib/afrotools/client";
import { mergeAfroToolsTaxResult } from "@/lib/afrotools/payroll";
import { payrollRequestSchema } from "@/lib/afrotools/schemas";
import {
  JsonBodyError,
  noStoreJson,
  noStoreResponse,
  readBoundedJson,
} from "@/lib/http/json";
import { calculateNigeriaPayroll } from "@/lib/payroll";
import type { NigeriaPayrollResult } from "@/lib/payroll";
import { rejectCrossOriginRequest } from "@/lib/security/origin";

const afroTaxSchema = z.object({
  status: z.literal("success"),
  deductions: z.object({
    pension: z.number().finite().min(0),
    nhf: z.number().finite().min(0),
    nhis: z.number().finite().min(0),
    rentRelief: z.number().finite().min(0),
  }),
  tax: z.object({
    taxableIncome: z.number().finite().min(0),
    netTax: z.number().finite().min(0),
  }),
});

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOriginRequest(request);
  if (crossOrigin) return noStoreResponse(crossOrigin);

  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 40_000);
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof JsonBodyError && error.code === "too_large"
            ? "Request is too large."
            : "Invalid payroll calculation.",
      },
      {
        status:
          error instanceof JsonBodyError && error.code === "too_large"
            ? 413
            : 400,
      },
    );
  }

  const parsed = payrollRequestSchema.safeParse(payload);
  if (!parsed.success)
    return noStoreJson(
      { error: "Invalid payroll calculation." },
      { status: 400 },
    );

  let fallback: NigeriaPayrollResult;
  try {
    fallback = calculateNigeriaPayroll(parsed.data.input);
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid payroll calculation.",
      },
      { status: 400 },
    );
  }

  try {
    const response = await callAfroTools("/tax/paye", {
      country: "NG",
      grossAnnual: fallback.annual.grossEmploymentIncome,
      regime: "NTA_2026",
      pension: false,
      nhf: false,
      nhis: false,
      pensionAmount: fallback.annual.employeePension,
      nhfAmount: fallback.annual.nationalHousingFund,
      nhisAmount: fallback.annual.healthInsurance,
      annualRent: fallback.annual.rentPaid,
      mortgageInterest: fallback.annual.ownerOccupiedMortgageInterest,
      lifeAssurance: fallback.annual.lifeInsuranceOrDeferredAnnuity,
      minimumWageExempt: fallback.decisions.minimumWageExemptionApplied,
    });
    const upstream = afroTaxSchema.safeParse(response);
    if (!upstream.success) throw invalidAfroToolsResponse();
    return noStoreJson({
      result: mergeAfroToolsTaxResult(fallback, upstream.data),
      provider: "afrotools",
    });
  } catch (error) {
    logAfroToolsFallback("paye", error);
    return noStoreJson({
      result: fallback,
      provider: "salarypadi_fallback",
      notice:
        "AfroTools PAYE was unavailable, so the verified SalaryPadi fallback engine was used.",
    });
  }
}
