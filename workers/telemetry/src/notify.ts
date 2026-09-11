// Cloudflare Worker — contribution notification mail (opt-in admin alert).
// Fires only for ingestion events worth a human look; silent otherwise.
// The mail path never affects ingest: delivery runs via ctx.waitUntil (the
// POST response is never delayed) and send failures are caught and logged.

export const NOTIFY_FROM = "notify@ithmb-codec.dev";

// Minimal structural types so this module never depends on the exact
// @cloudflare/workers-types export names for Email bindings.
export interface NotifyMail {
  from: string;
  to: string;
  subject: string;
  text: string;
}
export interface NotifyBinding {
  send(message: NotifyMail): Promise<unknown>;
}
export interface NotifyEnv {
  NOTIFY?: NotifyBinding;
  NOTIFY_EMAIL?: string;
}

export interface NotificationDetail {
  key: string;
  prefix: number;
  status: string;
  hasFullFile: boolean;
  header: string | null;
  extension?: string | undefined; // exactOptionalPropertyTypes: explicit undefined must be written
}

// Notify when a submission is worth a human look: an unrecognized nonzero
// prefix (a potentially new format — the discovery path), or any submission
// with a full file attached. Everything else (success reports, prefix-0
// junk, known failures without files) stays silent.
export function shouldNotify(prefix: number, status: string, hasFullFile: boolean): boolean {
  if (hasFullFile) return true;
  return status === "unknown" && prefix !== 0;
}

export async function sendContributionNotification(
  env: NotifyEnv,
  detail: NotificationDetail,
): Promise<void> {
  const binding = env.NOTIFY;
  const to = env.NOTIFY_EMAIL;
  if (!binding || !to) return; // not configured (local/dev) — silent
  if (!shouldNotify(detail.prefix, detail.status, detail.hasFullFile)) return;
  const subject =
    `ithmb contribution: ${detail.status} prefix ${detail.prefix}` +
    (detail.hasFullFile ? " + full file" : "");
  const lines: Array<string | null | undefined> = [
    "A telemetry submission worth a look landed in FORMAT_TELEMETRY.",
    `key: ${detail.key}`,
    `prefix: ${detail.prefix}`,
    `status: ${detail.status}`,
    `full file: ${detail.hasFullFile ? "yes" : "no"}`,
    `header: ${detail.header ?? "—"}`,
    detail.extension ? `extension: ${detail.extension}` : null,
    "Dashboard: https://ithmb-telemetry.ithmb-codec.workers.dev/dashboard",
  ];
  const text = lines.filter((l): l is string => typeof l === "string").join("\n");
  try {
    await binding.send({ from: NOTIFY_FROM, to, subject, text });
  } catch (err) {
    console.error(
      `telemetry: notification mail failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
