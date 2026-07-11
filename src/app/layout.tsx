import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";

import { AnalyticsConsent } from "@/components/analytics-consent";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { JsonLd } from "@/components/json-ld";
import { getViewer } from "@/lib/auth/dal";
import { getAppOrigin } from "@/lib/env";

import "./globals.css";

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
  openGraph: {
    type: "website",
    locale: "en_NG",
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
  themeColor: "#fffaf2",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading headers opts the tree into request-time rendering so Next.js can
  // apply the per-request CSP nonce generated in src/proxy.ts.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce");
  const viewer = await getViewer();
  const analyticsCookie = (await cookies()).get("salarypadi_analytics")?.value;
  const analyticsConsent =
    analyticsCookie === "granted" || analyticsCookie === "denied"
      ? analyticsCookie
      : null;

  return (
    <html lang="en-NG" data-scroll-behavior="smooth">
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
            description:
              "Source-attributed job discovery and privacy-thresholded career intelligence for Africans.",
            areaServed: { "@type": "Country", name: "Nigeria" },
          }}
        />
        <main className="site-main" id="main-content">
          {children}
        </main>
        <SiteFooter />
        <AnalyticsConsent initialConsent={analyticsConsent} />
      </body>
    </html>
  );
}
