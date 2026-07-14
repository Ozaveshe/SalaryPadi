import { z } from "zod";

import { contributionKindSchema } from "@/lib/contributions/schemas";

const draftFieldNameSchema = z
  .string()
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const draftValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(500)).max(50),
]);

export const contributionDraftPayloadSchema = z
  .record(draftFieldNameSchema, draftValueSchema)
  .refine(
    (payload) => Object.keys(payload).length <= 100,
    "A contribution draft can contain at most 100 fields.",
  );

export const contributionDraftSchema = z
  .object({
    id: z.string().uuid(),
    kind: contributionKindSchema,
    payload: contributionDraftPayloadSchema,
    updated_at: z.iso.datetime({ offset: true }),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export const contributionDraftResponseSchema = z
  .object({ draft: contributionDraftSchema.nullable() })
  .strict();

export const contributionDraftDeleteResponseSchema = z
  .object({ deleted: z.boolean() })
  .strict();

export const contributionDraftSaveRequestSchema = z
  .object({
    kind: contributionKindSchema,
    payload: contributionDraftPayloadSchema,
  })
  .strict();

export type ContributionDraft = z.infer<typeof contributionDraftSchema>;
