import { z } from "zod";

const authLinkCredentialSchema = z
  .string()
  .min(8)
  .max(2_048)
  .regex(/^[\x21-\x7E]+$/);

export function parseAuthLinkCredential(value: string | null) {
  const parsed = authLinkCredentialSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
