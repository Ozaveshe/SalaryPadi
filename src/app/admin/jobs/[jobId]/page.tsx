import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminJobDetailView } from "@/components/admin/admin-job-detail-view";
import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { getAdminJobDetailResult } from "@/lib/admin/jobs";
import { requireStaff } from "@/lib/auth/dal";

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const viewer = await requireStaff(["data_quality", "admin"]);
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) notFound();

  const result = await getAdminJobDetailResult(jobId);
  if (result.state === "ready" && !result.data) notFound();

  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected job evidence"
        title={result.data?.job_data.title ?? "Job detail unavailable"}
        description="Review the normalized record, original source, rights, freshness, eligibility and publication blockers before changing its status. Missing evidence remains explicit."
      />
      <p>
        <Link href="/admin/jobs">← Back to job search</Link>
      </p>
      <RepositoryNotice result={result} resource="Job evidence" />
      {result.data ? (
        <AdminJobDetailView
          detail={result.data}
          canTransition={viewer.isAdmin}
        />
      ) : null}
    </div>
  );
}
