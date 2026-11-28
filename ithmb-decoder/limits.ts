// Session limits and accounting. One place for the caps that keep a batch
// from exhausting memory or the DOM (edge-audit F01/F05).

const MB = 1024 * 1024;

/**
 * Init watchdog budget in ms. The single source for both clocks: app.ts's
 * Promise.race cap and decoder-watchdog.ts's navigation deadline must agree,
 * so the constant lives here instead of being duplicated in both files.
 */
export const INIT_TIMEOUT_MS = 15000;

export const LIMITS = {
  /** Per-file cap (unchanged). */
  FILE_BYTES: 8 * MB,
  /** Max accepted files per session (not per drop). */
  SESSION_FILES: 200,
  /** Aggregate accepted raw bytes per session. */
  SESSION_BYTES: 256 * MB,
  /** Keep the filmstrip DOM small: render at most this many thumbs. */
  FILMSTRIP_THUMBS: 50,
  /** Failure entries keep only enough bytes to describe the failure. */
  FAILURE_BYTES: 512,
  /** Warn/confirm before building an archive larger than this. */
  ZIP_WARN_BYTES: 100 * MB,
  /** Yield to the event loop every N encoded entries. */
  ZIP_YIELD_EVERY: 4,
} as const;

/** Round a byte count to the whole MB the copy quotes. */
export function limitMb(bytes: number): number {
  return Math.round(bytes / MB);
}

/**
 * The canonical limits description values. Locale templates (app.help,
 * ui.summaryTooLarge) interpolate these, and tests/copy-sources.spec.ts checks
 * the static guide/decoder copy against the same numbers, so the caps are
 * quoted from LIMITS and can never be hand-written stale.
 */
export const LIMIT_VALUES = {
  fileMb: limitMb(LIMITS.FILE_BYTES),
  sessionFiles: LIMITS.SESSION_FILES,
  sessionMb: limitMb(LIMITS.SESSION_BYTES),
  zipMb: limitMb(LIMITS.ZIP_WARN_BYTES),
} as const;

/** Session counters reset when the first batch starts. */
export const session = {
  files: 0,
  bytes: 0,
};

export function resetSession(): void {
  session.files = 0;
  session.bytes = 0;
}

export interface AdmitResult {
  ok: boolean;
  reason?: "fileCap" | "byteCap";
}

/** Reserve a slot/bytes for one accepted file. Rejected files never enter. */
export function admitSessionFile(size: number): AdmitResult {
  if (session.files >= LIMITS.SESSION_FILES) return { ok: false, reason: "fileCap" };
  if (session.bytes + size > LIMITS.SESSION_BYTES) return { ok: false, reason: "byteCap" };
  session.files++;
  session.bytes += size;
  return { ok: true };
}
