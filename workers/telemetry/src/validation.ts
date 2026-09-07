// Cloudflare Worker — Entry validation

import { validBase64Payload } from "./crypto";
import type { TelemetryBody } from "./types";
import { FULL_FILE_B64_MAX, KNOWN_ISSUES, VALID_STATUSES } from "./types";

export interface ValidatedEntry {
  prefix: number;
  status: string;
  issue: string | null;
  issueDetail: string | null;
  width: number | null;
  height: number | null;
  header: string | null;
  fullFile: string | null;
  extension: string | null;
  hasFullFileInput: boolean;
}

// ---- Field validation ----
export function validateEntry(body: TelemetryBody): ValidatedEntry {
  const status = VALID_STATUSES.has(body.status ?? "") ? body.status : "success";
  const issue =
    typeof body.issue === "string" && body.issue.length <= 40 && KNOWN_ISSUES.has(body.issue)
      ? body.issue
      : null;
  const issueDetail =
    typeof body.issue_detail === "string" && body.issue_detail.length <= 200
      ? body.issue_detail
      : null;
  const width = typeof body.width === "number" && body.width > 0 ? body.width : null;
  const height = typeof body.height === "number" && body.height > 0 ? body.height : null;
  // Header must be a hex signature (client sends bytesToHex(bytes, "")).
  // Non-hex values are rejected (stored as null) so a "<script>" payload
  // can never be persisted and later interpolated into the dashboard.
  const header =
    typeof body.header === "string" &&
    body.header.length <= 200 &&
    /^[0-9a-fA-F]+$/.test(body.header)
      ? body.header
      : null;
  const fullFile =
    typeof body.full_file === "string" &&
    body.full_file.length <= FULL_FILE_B64_MAX &&
    status !== "success" &&
    // non-success: known-failed (decoder bug) OR unknown (potential new
    // format) — the full file is where the research value is
    validBase64Payload(body.full_file)
      ? body.full_file
      : null;
  const extension = body.extension === "ipm" || body.extension === "ithmb" ? body.extension : null;

  return {
    prefix: body.prefix as number,
    status: status as string,
    issue,
    issueDetail,
    width,
    height,
    header,
    fullFile,
    extension,
    // Track whether the raw input included a full_file (even if validation
    // rejected it) so the dedup key matches the original behavior.
    hasFullFileInput: Boolean(body.full_file),
  };
}
