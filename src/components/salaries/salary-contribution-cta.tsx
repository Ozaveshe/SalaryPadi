import Link from "next/link";

import { buildSalaryContributionHref } from "@/lib/salaries/contribution";

export function SalaryContributionCta({
  company,
  role,
  country,
  heading = "Help make real salary evidence visible",
  description = "Share your own pay privately. It is moderated and never shown as an individual record.",
}: {
  company?: string | null;
  role?: string | null;
  country?: string | null;
  heading?: string;
  description?: string;
}) {
  return (
    <div className="surface surface-pad stack">
      <h3 className="m-0 text-lg font-bold">{heading}</h3>
      <p className="text-muted m-0 text-sm">{description}</p>
      <Link
        className="button button-secondary w-fit"
        href={buildSalaryContributionHref({ company, role, country })}
      >
        Contribute salary privately
      </Link>
    </div>
  );
}
