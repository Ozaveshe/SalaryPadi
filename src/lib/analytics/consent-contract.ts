import { z } from "zod";

export const analyticsConsentRequestSchema = z
  .object({ allowed: z.boolean() })
  .strict();

export const analyticsConsentResponseSchema = z
  .object({ allowed: z.boolean() })
  .strict();
