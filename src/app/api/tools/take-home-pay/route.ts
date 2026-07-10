import { z } from "zod";

import { callAfroTools } from "@/lib/afrotools/client";
import { mergeAfroToolsTaxResult } from "@/lib/afrotools/payroll";
import { payrollRequestSchema } from "@/lib/afrotools/schemas";
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
  if (crossOrigin) return crossOrigin;
  if (Number(request.headers.get("content-length") ?? "0") > 40_000)
    return Response.json({ error: "Request is too large." }, { status: 413 });
  const parsed = payrollRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Invalid payroll calculation." },
      { status: 400 },
    );

  let fallback: NigeriaPayrollResult;
  try {
    fallback = calculateNigeriaPayroll(parsed.data.input);
  } catch (error) {
    return Response.json(
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
    if (!upstream.success) throw new Error("Unexpected AfroTools response.");
    return Response.json({
      result: mergeAfroToolsTaxResult(fallback, upstream.data),
      provider: "afrotools",
    });
  } catch {
    return Response.json({
      result: fallback,
      provider: "salarypadi_fallback",
      notice:
        "AfroTools PAYE was unavailable, so the verified SalaryPadi fallback engine was used.",
    });
  }
}
