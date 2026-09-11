// Cloudflare Worker — Type definitions and constants
// Shared across all worker modules.

/// <reference types="@cloudflare/workers-types" />
// Worker bindings. `FORMAT_TELEMETRY` is the KV namespace; `ADMIN_TOKEN`
// gates the dashboard; `IP_HMAC_SECRET` (optional) keys the IP pseudonym —
// without it the code falls back to ADMIN_TOKEN as the HMAC key.
// `NOTIFY` (optional) is the Email Service send_email binding for
// contribution alerts; `NOTIFY_EMAIL` (optional secret) is its recipient.
// The binding is deliberately unrestricted: the address lives in the
// secret, never in the repo, and the platform only delivers to verified
// destinations. Both absent locally/in tests — the mail path then skips.
export interface Env {
  FORMAT_TELEMETRY: KVNamespace;
  ADMIN_TOKEN: string;
  IP_HMAC_SECRET?: string;
  NOTIFY?: import("./notify").NotifyBinding;
  NOTIFY_EMAIL?: string;
}

// Shape of a stored record (all fields optional: legacy records predate
// per-field validation, and legacy records omit status/issue/extension).
export interface StoredRecord {
  prefix?: number;
  width?: number | null;
  height?: number | null;
  fileSize?: number;
  header?: string;
  status?: string;
  issue?: string;
  issueDetail?: string;
  extension?: string;
  hasFullFile?: boolean;
  // Legacy compat: old KV records (pre-hasFullFile) stored a boolean flag.
  // The dashboard reads both fullFile and hasFullFile so legacy records
  // with 365-day TTL are counted correctly. Remove after Aug 2027.
  fullFile?: boolean;
  fp?: string;
  timestamp?: string;
}

// Shape of a POST body. All fields optional — the worker validates each one
// defensively before it is stored.
export interface TelemetryEntry {
  prefix?: number;
  status?: string;
  full_file?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  header?: string;
  issue?: string;
  issue_detail?: string;
  extension?: string;
}

export type TelemetryBody = TelemetryEntry;

// 13 MB body cap: allows a full 8 MiB file (base64 ~10.67 MB) plus JSON
// wrapper. Free-plan CPU: JSON.parse of the largest body is ~5 ms (< 10 ms limit).
export const MAX_BODY_BYTES = 13 * 1024 * 1024;
export const MAX_RECORDS_PER_FP_PER_DAY = 50;
export const RATE_LIMIT_PER_DAY = 100;
export const MAX_RECORDS_PER_IP_PER_DAY = 250;
export const RATE_LIMIT_PER_IP_PER_DAY = 500;
// base64 length of an 8 MiB file — mirrors client FULL_FILE_MAX_BYTES (app's
// own decode limit; files larger than 8 MB are rejected by the client anyway).
export const FULL_FILE_B64_MAX = Math.ceil((8 * 1024 * 1024) / 3) * 4;
export const VALID_STATUSES = new Set([
  "success",
  "known-failed",
  "unknown",
  "looks-good",
  "looks-wrong",
]);
export const KNOWN_ISSUES = new Set([
  "color_space",
  "dimensions",
  "stride",
  "offset",
  "byte_order",
  "other",
]);
