export type FreshnessCheck = {
  id: string;
  status: "pass" | "fail" | "skip";
  summary: string;
  exit_code: number;
};

export type FreshnessResult = {
  status: "fresh" | "failed";
  origin: string | null;
  mode: "scheduled" | "post_deploy" | null;
  deploy_started_at: string | null;
  checked_at: string;
  exit_code: number;
  required_workers: string[];
  verified_routes: string[];
  checks: FreshnessCheck[];
};

export const EXIT_CODES: Readonly<Record<string, number>>;
export const REQUIRED_WORKERS: readonly string[];
export const VERIFIED_ROUTES: readonly string[];

export function parseCliArgs(argv: string[]): {
  json: boolean;
  deployStartedAt: string | null;
  help: boolean;
};

export function verifyProductionFreshness(options?: {
  origin?: string;
  deployStartedAt?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutSignal?: (timeoutMs: number) => AbortSignal | undefined;
}): Promise<FreshnessResult>;

export function formatHumanResult(result: FreshnessResult): string;

export function runCli(options?: {
  argv?: string[];
  environment?: Record<string, string | undefined>;
  write?: (value: string) => void;
  verify?: typeof verifyProductionFreshness;
}): Promise<number>;
