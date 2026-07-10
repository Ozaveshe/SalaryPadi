import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverEnvironmentSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    REMOTIVE_SOURCE_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    ALLOW_DEMO_DATA: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    ANALYTICS_PROVIDER: z.enum(["none"]).default("none"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((value, context) => {
    const hasUrl = Boolean(value.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

    if (hasUrl !== hasKey) {
      context.addIssue({
        code: "custom",
        message:
          "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured together.",
      });
    }

    if (value.NODE_ENV === "production" && value.ALLOW_DEMO_DATA) {
      context.addIssue({
        code: "custom",
        message: "ALLOW_DEMO_DATA cannot be enabled in production.",
      });
    }

    if (value.NODE_ENV === "production") {
      if (!value.NEXT_PUBLIC_APP_URL) {
        context.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_APP_URL"],
          message:
            "NEXT_PUBLIC_APP_URL must be explicitly configured in production.",
        });
      } else {
        const appUrl = new URL(value.NEXT_PUBLIC_APP_URL);
        const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
        if (
          appUrl.protocol !== "https:" ||
          loopbackHosts.has(appUrl.hostname)
        ) {
          context.addIssue({
            code: "custom",
            path: ["NEXT_PUBLIC_APP_URL"],
            message:
              "NEXT_PUBLIC_APP_URL must use HTTPS and a non-loopback host in production.",
          });
        }
      }
    }
  })
  .transform((value) => ({
    ...value,
    NEXT_PUBLIC_APP_URL: value.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  }));

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse({
    NEXT_PUBLIC_APP_URL: environment.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: environment.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY,
    REMOTIVE_SOURCE_ENABLED: environment.REMOTIVE_SOURCE_ENABLED,
    ALLOW_DEMO_DATA: environment.ALLOW_DEMO_DATA,
    ANALYTICS_PROVIDER: environment.ANALYTICS_PROVIDER,
    NODE_ENV: environment.NODE_ENV,
  });

  if (!result.success) {
    throw new Error(
      `Invalid SalaryPadi environment: ${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

export function getServerEnvironment(): ServerEnvironment {
  if (cachedEnvironment) return cachedEnvironment;
  cachedEnvironment = parseServerEnvironment(process.env);
  return cachedEnvironment;
}

export function getSupabasePublicConfig() {
  const environment = getServerEnvironment();
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function getAppOrigin() {
  return new URL(getServerEnvironment().NEXT_PUBLIC_APP_URL).origin;
}
