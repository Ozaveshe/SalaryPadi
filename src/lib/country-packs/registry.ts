import { z } from "zod";

import rawRegistry from "../../../config/country-packs.json";

const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
const localeSchema = z
  .object({
    tag: z
      .string()
      .min(2)
      .max(35)
      .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    language: z.string().regex(/^[a-z]{2,3}$/),
    direction: z.enum(["ltr", "rtl"]),
    contentStatus: z.enum(["configured", "reviewed"]),
  })
  .strict()
  .refine((locale) => locale.tag.startsWith(locale.language), {
    path: ["tag"],
    message: "locale tag must match its language",
  });

const thresholdsSchema = z
  .object({
    authorizedActiveJobs: z.number().int().positive(),
    authorizedSources: z.number().int().min(2),
    explicitEligibilityRatio: z.number().min(0.8).max(1),
    uniqueContentPages: z.number().int().positive(),
    firstPartyContributions: z.number().int().positive(),
  })
  .strict();

const countryPackSchema = z
  .object({
    countryCode: countryCodeSchema,
    iso3: z.string().regex(/^[A-Z]{3}$/),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(2).max(100),
    routePrefix: z.string().regex(/^(?:|\/[a-z]{2})$/),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    defaultLocale: z.string().min(2).max(35),
    defaultTimeZone: z.string().min(3).max(100),
    locales: z
      .array(localeSchema)
      .min(1)
      .max(20)
      .refine(
        (locales) =>
          new Set(locales.map((locale) => locale.tag)).size === locales.length,
        { message: "locale tags must be unique" },
      ),
    terminology: z
      .object({
        subdivisionSingular: z.string().min(2).max(40),
        subdivisionPlural: z.string().min(2).max(40),
        resume: z.string().min(2).max(20),
        postalCode: z.string().min(2).max(40),
      })
      .strict(),
    activation: z
      .object({
        state: z.enum(["candidate", "launch", "active", "suspended"]),
        publicRoutesEnabled: z.boolean(),
        searchIndexEnabled: z.boolean(),
        autoTranslate: z.literal(false),
        thresholds: thresholdsSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((pack, context) => {
    if (!pack.locales.some((locale) => locale.tag === pack.defaultLocale)) {
      context.addIssue({
        code: "custom",
        path: ["defaultLocale"],
        message: "default locale must be present in locales",
      });
    }
    if (
      pack.activation.searchIndexEnabled &&
      !pack.activation.publicRoutesEnabled
    ) {
      context.addIssue({
        code: "custom",
        path: ["activation", "searchIndexEnabled"],
        message: "search indexing requires public routes",
      });
    }
    const launchState = ["launch", "active"].includes(pack.activation.state);
    if (pack.activation.publicRoutesEnabled !== launchState) {
      context.addIssue({
        code: "custom",
        path: ["activation", "publicRoutesEnabled"],
        message:
          "public routes must be enabled exactly for launch or active packs",
      });
    }
    if (
      (pack.activation.publicRoutesEnabled ||
        pack.activation.searchIndexEnabled) &&
      !pack.locales.some(
        (locale) =>
          locale.tag === pack.defaultLocale &&
          locale.contentStatus === "reviewed",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["locales"],
        message: "an activated pack requires reviewed default-locale content",
      });
    }
  });

export const countryPackRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    routeStrategy: z.literal("launch-market-unprefixed"),
    defaultCountryCode: countryCodeSchema,
    packs: z.array(countryPackSchema).min(1).max(60),
  })
  .strict()
  .superRefine((registry, context) => {
    const countryCodes = new Set<string>();
    const routePrefixes = new Set<string>();
    const iso3Codes = new Set<string>();
    const slugs = new Set<string>();
    for (const [index, pack] of registry.packs.entries()) {
      for (const [field, values] of [
        ["countryCode", countryCodes],
        ["iso3", iso3Codes],
        ["slug", slugs],
        ["routePrefix", routePrefixes],
      ] as const) {
        const value = pack[field];
        if (values.has(value)) {
          context.addIssue({
            code: "custom",
            path: ["packs", index, field],
            message: `duplicate country pack ${field} ${value}`,
          });
        }
        values.add(value);
      }
      const isDefault = pack.countryCode === registry.defaultCountryCode;
      if ((pack.routePrefix === "") !== isDefault) {
        context.addIssue({
          code: "custom",
          path: ["packs", index, "routePrefix"],
          message: "only the default country may use the unprefixed route",
        });
      }
    }
    if (!countryCodes.has(registry.defaultCountryCode)) {
      context.addIssue({
        code: "custom",
        path: ["defaultCountryCode"],
        message: "default country must exist",
      });
    }
  });

export type CountryPack = z.infer<typeof countryPackSchema>;
export type CountryPackCode = CountryPack["countryCode"];
export type CountryPackThresholds = z.infer<typeof thresholdsSchema>;

export const COUNTRY_PACK_REGISTRY =
  countryPackRegistrySchema.parse(rawRegistry);
export const COUNTRY_PACKS = COUNTRY_PACK_REGISTRY.packs;

const packsByCode = new Map(
  COUNTRY_PACKS.map((pack) => [pack.countryCode, pack]),
);
const packsBySlug = new Map(COUNTRY_PACKS.map((pack) => [pack.slug, pack]));

export function getCountryPack(countryCodeOrSlug: string) {
  return (
    packsByCode.get(countryCodeOrSlug.toUpperCase()) ??
    packsBySlug.get(countryCodeOrSlug.toLowerCase()) ??
    null
  );
}

export function getDefaultCountryPack() {
  const pack = packsByCode.get(COUNTRY_PACK_REGISTRY.defaultCountryCode);
  if (!pack) throw new Error("Country pack registry has no default country.");
  return pack;
}

export function isCountryPackPublic(pack: CountryPack) {
  return (
    pack.activation.publicRoutesEnabled &&
    (pack.activation.state === "launch" ||
      pack.activation.state === "active") &&
    pack.locales.some(
      (locale) =>
        locale.tag === pack.defaultLocale &&
        locale.contentStatus === "reviewed",
    )
  );
}

export function isCountryPackIndexable(pack: CountryPack) {
  return isCountryPackPublic(pack) && pack.activation.searchIndexEnabled;
}
