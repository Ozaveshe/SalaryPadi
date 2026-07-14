import { z } from "zod";

import rawRegistry from "../../../config/production-workers.json";

const workerKeySchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9_]+$/);

const workerRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    workerKeys: z
      .array(workerKeySchema)
      .min(1)
      .max(30)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        "Worker keys must be unique.",
      ),
  })
  .strict();

export const PRODUCTION_WORKER_REGISTRY =
  workerRegistrySchema.parse(rawRegistry);
export const EXPECTED_WORKER_KEYS = PRODUCTION_WORKER_REGISTRY.workerKeys as [
  string,
  ...string[],
];
