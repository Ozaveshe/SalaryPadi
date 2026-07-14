import "server-only";

import { z } from "zod";

import {
  DEFAULT_AFROTOOLS_API_BASE,
  getAfroToolsApiBase,
} from "@/lib/integrations/urls";
import { getSalaryPadiSupabaseOrigin } from "@/lib/supabase/project";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalHttpOrigin = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.pathname === "/" || url.pathname === "")
      );
    }, "must be a credential-free HTTP(S) origin without a path, query, or fragment")
    .optional(),
);

const optionalCredential = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .min(1)
    .max(4_096)
    .regex(/^[^\s\u0000-\u001f\u007f]+$/, "must be a single bounded token")
    .optional(),
);

const optionalGoogleAnalyticsId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .trim()
    .regex(
      /^G-[A-Z0-9]{6,20}$/,
      "must be a GA4 measurement ID such as G-ABC123DEF4",
    )
    .optional(),
);

const optionalInternalToken = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .min(32)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
);

const emailAddressSchema = z.email().max(320);

function optionalMailbox(allowDisplayName: boolean) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .max(422)
      .refine((value) => {
        if (emailAddressSchema.safeParse(value).success) return true;
        if (!allowDisplayName) return false;
        const displayMailbox =
          /^([^<>\r\n]{1,100})\s+<([^<>\r\n]{3,320})>$/.exec(value);
        return Boolean(
          displayMailbox &&
          displayMailbox[1] === displayMailbox[1]?.trim() &&
          emailAddressSchema.safeParse(displayMailbox[2]).success,
        );
      }, "must be a valid email mailbox")
      .optional(),
  );
}

const serverEnvironmentSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: optionalHttpOrigin,
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalCredential,
    NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: optionalGoogleAnalyticsId,
    SUPABASE_SERVICE_ROLE_KEY: optionalCredential,
    JOB_SOURCE_SYNC_TOKEN: optionalInternalToken,
    AFROTOOLS_API_BASE_URL: optionalUrl,
    AFROTOOLS_API_KEY: optionalCredential,
    LOGO_DEV_PUBLISHABLE_KEY: optionalCredential,
    RESEND_API_KEY: optionalCredential,
    TRANSACTIONAL_EMAIL_FROM: optionalMailbox(true),
    TRANSACTIONAL_EMAIL_REPLY_TO: optionalMailbox(false),
    REMOTIVE_SOURCE_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    EDITORIAL_AUTOMATION_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    ALLOW_DEMO_DATA: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    ANALYTICS_PROVIDER: z
      .enum(["none", "supabase_first_party"])
      .default("none"),
    EMAIL_PROVIDER: z.enum(["none", "resend"]).default("none"),
    CURRENCY_RATE_PROVIDER: z
      .enum(["none", "european_commission_inforeuro"])
      .default("none"),
    CI: z.enum(["true", "false"]).optional(),
    SALARYPADI_LOCAL_E2E: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
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

    if (value.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        getSalaryPadiSupabaseOrigin(value.NEXT_PUBLIC_SUPABASE_URL, {
          allowLocal: value.NODE_ENV !== "production",
        });
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["NEXT_PUBLIC_SUPABASE_URL"],
          message:
            error instanceof Error
              ? error.message
              : "SalaryPadi Supabase URL is invalid.",
        });
      }
    }

    if (value.AFROTOOLS_API_BASE_URL) {
      try {
        getAfroToolsApiBase(value.AFROTOOLS_API_BASE_URL, {
          allowLocal: value.NODE_ENV !== "production",
        });
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["AFROTOOLS_API_BASE_URL"],
          message:
            error instanceof Error
              ? error.message
              : "AfroTools API base URL is invalid.",
        });
      }
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
        const loopbackHosts = new Set([
          "localhost",
          "127.0.0.1",
          "::1",
          "[::1]",
        ]);
        const localE2EOrigin =
          value.CI === "true" &&
          value.SALARYPADI_LOCAL_E2E &&
          loopbackHosts.has(appUrl.hostname);
        if (
          !localE2EOrigin &&
          (appUrl.protocol !== "https:" || loopbackHosts.has(appUrl.hostname))
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
  .transform(({ CI, SALARYPADI_LOCAL_E2E, ...value }) => {
    void CI;
    void SALARYPADI_LOCAL_E2E;
    return {
      ...value,
      NEXT_PUBLIC_APP_URL: value.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    };
  });

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
    NEXT_PUBLIC_GOOGLE_ANALYTICS_ID:
      environment.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID,
    SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY,
    JOB_SOURCE_SYNC_TOKEN: environment.JOB_SOURCE_SYNC_TOKEN,
    AFROTOOLS_API_BASE_URL: environment.AFROTOOLS_API_BASE_URL,
    AFROTOOLS_API_KEY: environment.AFROTOOLS_API_KEY,
    LOGO_DEV_PUBLISHABLE_KEY: environment.LOGO_DEV_PUBLISHABLE_KEY,
    RESEND_API_KEY: environment.RESEND_API_KEY,
    TRANSACTIONAL_EMAIL_FROM: environment.TRANSACTIONAL_EMAIL_FROM,
    TRANSACTIONAL_EMAIL_REPLY_TO: environment.TRANSACTIONAL_EMAIL_REPLY_TO,
    REMOTIVE_SOURCE_ENABLED: environment.REMOTIVE_SOURCE_ENABLED,
    EDITORIAL_AUTOMATION_ENABLED: environment.EDITORIAL_AUTOMATION_ENABLED,
    ALLOW_DEMO_DATA: environment.ALLOW_DEMO_DATA,
    ANALYTICS_PROVIDER: environment.ANALYTICS_PROVIDER,
    EMAIL_PROVIDER: environment.EMAIL_PROVIDER,
    CURRENCY_RATE_PROVIDER: environment.CURRENCY_RATE_PROVIDER,
    CI: environment.CI,
    SALARYPADI_LOCAL_E2E: environment.SALARYPADI_LOCAL_E2E,
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
  return {
    url: getSalaryPadiSupabaseOrigin(url, {
      allowLocal: environment.NODE_ENV !== "production",
    }),
    publishableKey,
  };
}

export function getAppOrigin() {
  return new URL(getServerEnvironment().NEXT_PUBLIC_APP_URL).origin;
}

export function getGoogleAnalyticsId() {
  return getServerEnvironment().NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ?? null;
}

export function getAfroToolsConfig() {
  const environment = getServerEnvironment();
  return {
    baseUrl: getAfroToolsApiBase(
      environment.AFROTOOLS_API_BASE_URL ?? DEFAULT_AFROTOOLS_API_BASE,
      { allowLocal: environment.NODE_ENV !== "production" },
    ),
    apiKey: environment.AFROTOOLS_API_KEY,
  };
}
