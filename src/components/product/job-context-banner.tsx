import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";

import type { JobContext } from "@/lib/product/job-context";

/**
 * Shown at the top of a pay tool when the user arrived from a job, so the
 * journey stays visible: the role they came from, the employer, and a way back
 * that does not rely on browser history.
 */
export function JobContextBanner({
  context,
  action,
}: {
  context: JobContext;
  action: string;
}) {
  return (
    <aside className="job-context-banner" aria-label="Continuing from a job">
      <div className="job-context-banner-copy">
        <p className="job-context-banner-action">{action}</p>
        <p className="job-context-banner-role">
          <strong>{context.title}</strong>
          <span className="job-context-banner-employer">
            <Building2 aria-hidden="true" size={15} />
            {context.companySlug ? (
              <Link href={`/companies/${context.companySlug}`}>
                {context.company}
              </Link>
            ) : (
              context.company
            )}
          </span>
        </p>
      </div>
      <Link className="button button-secondary" href={`/jobs/${context.slug}`}>
        <ArrowLeft aria-hidden="true" size={16} />
        Back to the job
      </Link>
    </aside>
  );
}
