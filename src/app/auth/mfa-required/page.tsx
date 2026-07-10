import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaPanel } from "@/components/auth/mfa-panel";
import { PageHeading } from "@/components/page-heading";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Second factor required",
  robots: { index: false, follow: false },
};

export default async function MfaRequiredPage() {
  const viewer = await requireViewer("/auth/mfa-required");
  if (!viewer.isAdmin) redirect("/?notice=admin-access-required");
  if (viewer.aal === "aal2") redirect("/admin");

  return (
    <div className="reading-shell stack-lg">
      <PageHeading
        eyebrow="Admin security"
        title="A second factor is required"
        description="SalaryPadi requires an AAL2 session before moderation, role, source or privacy operations. Your current session is signed in but not strongly authenticated."
      />
      <MfaPanel />
    </div>
  );
}
