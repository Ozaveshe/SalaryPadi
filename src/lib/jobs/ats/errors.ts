import type { AtsProvider } from "./types";

export const ATS_ADAPTER_ERROR_CODES = [
  "ats_source_disabled",
  "ats_invalid_source",
  "ats_deadline_required",
  "ats_request_aborted",
  "ats_request_failed",
  "ats_http_error",
  "ats_invalid_content_type",
  "ats_response_too_large",
  "ats_response_read_failed",
  "ats_invalid_json",
  "ats_invalid_payload",
  "ats_normalization_failed",
] as const;

export type AtsAdapterErrorCode = (typeof ATS_ADAPTER_ERROR_CODES)[number];

const SAFE_ERROR_MESSAGES = {
  ats_source_disabled: "The ATS source is not employer-authorized.",
  ats_invalid_source: "The ATS source configuration is invalid.",
  ats_deadline_required: "The ATS request requires a caller-owned deadline.",
  ats_request_aborted: "The ATS request was cancelled.",
  ats_request_failed: "The ATS source could not be reached.",
  ats_http_error: "The ATS source returned an unsuccessful status.",
  ats_invalid_content_type:
    "The ATS source returned an unexpected content type.",
  ats_response_too_large: "The ATS source response exceeded the allowed size.",
  ats_response_read_failed: "The ATS source response could not be read.",
  ats_invalid_json: "The ATS source returned invalid JSON.",
  ats_invalid_payload: "The ATS source did not match its documented format.",
  ats_normalization_failed: "An ATS job could not be normalized safely.",
} satisfies Record<AtsAdapterErrorCode, string>;

export class AtsAdapterError extends Error {
  readonly code: AtsAdapterErrorCode;
  readonly provider: AtsProvider | null;
  readonly status: number | null;

  constructor(
    code: AtsAdapterErrorCode,
    provider: AtsProvider | null = null,
    status: number | null = null,
  ) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "AtsAdapterError";
    this.code = code;
    this.provider = provider;
    this.status = status;
  }
}

export function atsAdapterError(
  code: AtsAdapterErrorCode,
  provider: AtsProvider | null = null,
  status: number | null = null,
) {
  return new AtsAdapterError(code, provider, status);
}
