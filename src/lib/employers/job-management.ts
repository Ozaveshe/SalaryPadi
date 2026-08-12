import "server-only";
import { z } from "zod";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const employerSubmissionStatuses = [
  "draft",
  "pending",
  "in_review",
  "revision_requested",
  "approved",
  "rejected",
  "removed",
] as const;
const submissionSchema = z.object({
  id: z.string().uuid(),
  company_name: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(employerSubmissionStatuses),
  submitted_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  public_job_slug: z.string().min(1).nullable(),
});
export type EmployerJobSubmission = z.infer<typeof submissionSchema>;

export async function getMyEmployerJobSubmissions(): Promise<
  RepositoryResult<EmployerJobSubmission[]>
> {
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok || !clientAttempt.value) {
    return repositoryFailure(
      clientAttempt.ok ? "unconfigured" : "unavailable",
      [],
      repositoryIssue(
        "employer.jobs.read",
        clientAttempt.ok ? "not_configured" : "query_failed",
        clientAttempt.ok
          ? "employer_jobs_backend_unconfigured"
          : "employer_jobs_client_failed",
        clientAttempt.ok ? undefined : clientAttempt.error,
      ),
    );
  }
  const queryAttempt = await attemptRepositoryOperation(() =>
    clientAttempt
      .value!.schema("api")
      .from("my_employer_job_submissions")
      .select(
        "id,company_name,title,status,submitted_at,updated_at,public_job_slug",
      )
      .order("submitted_at", { ascending: false }),
  );
  if (!queryAttempt.ok || queryAttempt.value.error) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        "employer.jobs.read",
        "query_failed",
        "employer_jobs_query_failed",
        queryAttempt.ok ? queryAttempt.value.error : queryAttempt.error,
      ),
    );
  }
  const parsed = z.array(submissionSchema).safeParse(queryAttempt.value.data);
  if (!parsed.success)
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        "employer.jobs.read",
        "invalid_rows",
        "employer_jobs_invalid_rows",
        parsed.error,
      ),
    );
  return repositoryReady(parsed.data);
}
