import { z } from "zod";

import { safeExternalUrl } from "./urls";

/**
 * External links are executable browser destinations, not arbitrary URI
 * identifiers. Keep their transport and credential policy at the parsing
 * boundary so provider data cannot become an unsafe rendered href.
 */
export const externalHttpsUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => safeExternalUrl(value) !== null, {
    message: "Expected a credential-free HTTPS URL",
  });
