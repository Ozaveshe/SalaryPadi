import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies, headers } from "next/headers";

import { AnalyticsConsent } from "@/components/analytics-consent";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { JsonLd } from "@/components/json-ld";
import { getViewer } from "@/lib/auth/dal";
import { ANALYTICS_CONSENT_COOKIE } from "@/lib/analytics/consent";
import { getDefaultCountryPack } from "@/lib/country-packs/registry";
import { getAppOrigin, getGoogleAnalyticsId } from "@/lib/env";

import "./globals.css";

const defaultCountryPack = getDefaultCountryPack();

/*
 * The stylesheet has always asked for Inter and nothing has ever loaded it, so
 * every visitor has been reading the system stack instead — Segoe UI on
 * Windows, Roboto on Android. `next/font` self-hosts the file at build time, so
 * the typeface the design is actually set in arrives with no external request,
 * no third-party connection, and no layout shift.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-loaded",
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppOrigin()),
  title: {
    default: "SalaryPadi — Jobs and salary truth for Africans",
    template: "%s | SalaryPadi",
  },
  description:
    "Find source-attributed jobs open to Nigerians, understand real compensation, and inspect employer evidence before you apply.",
  applicationName: "SalaryPadi",
  category: "careers",
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    type: "website",
    locale: defaultCountryPack.defaultLocale.replace("-", "_"),
    siteName: "SalaryPadi",
    title: "SalaryPadi — Jobs and salary truth for Africans",
    description:
      "Check eligibility, compensation and employer evidence before you apply.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SalaryPadi — Jobs and salary truth for Africans",
    description:
      "Check eligibility, compensation and employer evidence before you apply.",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  // --surface-page (--sand-50). The previous #fffaf2 was a cream that no
  // longer appears anywhere in the palette, so browser chrome rendered a
  // different shade from the page it framed.
  themeColor: "#f7f8f6",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading headers opts the tree into request-time rendering so Next.js can
  // apply the per-request CSP nonce generated in src/proxy.ts.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce");
  const viewer = await getViewer();
  const cookieStore = await cookies();
  const analyticsCookie = cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value;
  const analyticsConsent =
    analyticsCookie === "granted" || analyticsCookie === "denied"
      ? analyticsCookie
      : null;

  return (
    <html
      lang={defaultCountryPack.defaultLocale}
      data-scroll-behavior="smooth"
      className={inter.variable}
    >
      <body className="flex min-h-screen flex-col">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader viewer={viewer} />
        <JsonLd
          nonce={nonce}
          data={{
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SalaryPadi",
            url: getAppOrigin(),
            // Search engines use this to attach a mark to the organization
            // entity. Without it the knowledge panel has no logo to show.
            logo: new URL("/brand/icon-512.png", getAppOrigin()).toString(),
            description:
              "Job discovery with every source named, and salary information that keeps individual contributions private. Built for Africans.",
            areaServed: {
              "@type": "Country",
              name: defaultCountryPack.name,
            },
          }}
        />
        <main className="site-main" id="main-content">
          {children}
        </main>
        <SiteFooter />
        <AnalyticsConsent
          initialConsent={analyticsConsent}
          measurementId={getGoogleAnalyticsId()}
          nonce={nonce}
        />
      </body>
    </html>
  );
}
