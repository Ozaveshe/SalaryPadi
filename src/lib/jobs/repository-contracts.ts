import type { Job, JobFeedSourceStatus } from "./types";

export type SourceFeed = JobFeedSourceStatus & { jobs: Job[] };

export function sourceUnavailable(
  key: SourceFeed["key"],
  checkedAt: string,
  code: string,
  message: string,
): SourceFeed {
  return {
    key,
    jobs: [],
    state: "unavailable",
    checkedAt,
    count: 0,
    code,
    message,
  };
}
