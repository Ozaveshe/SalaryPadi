export type PlatformSupplyState = {
  ready: boolean;
  state: string;
  capacity: number;
  target: number;
};

export type PlatformHealthResult = {
  ok: boolean;
  exitCode: number;
  failures: string[];
  workerHealthComplete: boolean;
  missingWorkers: string[];
  unhealthyWorkers: string[];
  supply: PlatformSupplyState;
};

export const PLATFORM_HEALTH_EXIT_CODES: Readonly<Record<string, number>>;

export function evaluatePlatformHealth(
  payload: unknown,
  httpStatus: number,
): PlatformHealthResult;

export function formatPlatformHealth(
  result: PlatformHealthResult,
  httpStatus: number,
): string;
