// Cloudflare Worker — KV persistence + POST ingestion handler

import { countKeys, fingerprint, ipFingerprint } from "./crypto";
import type { Env, TelemetryBody } from "./types";
import {
  MAX_BODY_BYTES,
  MAX_RECORDS_PER_FP_PER_DAY,
  MAX_RECORDS_PER_IP_PER_DAY,
  RATE_LIMIT_PER_DAY,
  RATE_LIMIT_PER_IP_PER_DAY,
} from "./types";
import { type ValidatedEntry, validateEntry } from "./validation";
import { sendContributionNotification } from "./notify";

// ---- Persist: dedup check + record count cap + KV store ----
export async function persistRecord(
  env: Env,
  data: ValidatedEntry,
  fp: string,
  ipHash: string,
  corsHeaders: Record<string, string>,
  ctx: ExecutionContext,
): Promise<Response> {
  // ---- Deduplication ----
  // Key includes whether a full file was attached so a header share can
  // be "upgraded" to a full-file share within the same 24h window.
  const dedupKey = `dedup:${fp}:${data.prefix}:${data.status}:${data.hasFullFileInput ? "f" : "h"}`;
  const existing = await env.FORMAT_TELEMETRY.get(dedupKey);
  if (existing) {
    // Duplicate within 24h — silently accept but don't store
    return new Response(JSON.stringify({ ok: true, dedup: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  // Day-scoped marker prefixes, counted not incremented (race-free caps).
  const recordPrefix = `records:${fp}:${today}:`;
  const ipRecordPrefix = `records-ip:${ipHash}:${today}:`;

  // ---- Record count cap (per fp + per IP per day) — list-based ----
  // KV has no atomic counters; read-then-write counters drifted under
  // concurrency (lost updates made the caps permanently bypassable).
  // Counting actual per-record keys self-corrects (CWE-362).
  const [storedCount, ipStoredCount] = await Promise.all([
    countKeys(env, recordPrefix, MAX_RECORDS_PER_FP_PER_DAY),
    countKeys(env, ipRecordPrefix, MAX_RECORDS_PER_IP_PER_DAY),
  ]);
  if (storedCount >= MAX_RECORDS_PER_FP_PER_DAY) {
    return new Response(JSON.stringify({ ok: false, error: "too many records" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (ipStoredCount >= MAX_RECORDS_PER_IP_PER_DAY) {
    return new Response(JSON.stringify({ ok: false, error: "too many records" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // ---- Store ----
  // Records are slim: the full-file payload (up to ~11 MB base64) lives
  // under its own `fullfile_<uuid>` key so dashboard/JSON renders never
  // pull multi-MB values (CWE-400). hasFullFile tracks presence.
  const uuid = crypto.randomUUID();
  const record = {
    prefix: data.prefix,
    width: data.width,
    height: data.height,
    status: data.status,
    issue: data.issue,
    issueDetail: data.issueDetail,
    header: data.header,
    hasFullFile: data.fullFile !== null,
    extension: data.extension,
    fp,
    timestamp: new Date().toISOString(),
  };
  const key = `fmt_${data.prefix}_${uuid}`;
  await env.FORMAT_TELEMETRY.put(key, JSON.stringify(record), {
    expirationTtl: 86400 * 365,
  });
  if (data.fullFile !== null) {
    await env.FORMAT_TELEMETRY.put(`fullfile_${uuid}`, data.fullFile, {
      expirationTtl: 86400 * 365,
    });
  }
  // Per-record cap markers (day-scoped, 2-day TTL).
  await env.FORMAT_TELEMETRY.put(`${recordPrefix}${uuid}`, "1", {
    expirationTtl: 86400 * 2,
  });
  await env.FORMAT_TELEMETRY.put(`${ipRecordPrefix}${uuid}`, "1", {
    expirationTtl: 86400 * 2,
  });
  // (Rate markers are written for every accepted request at the top of
  // the POST handler — before dedup/validation — so no path can replay
  // without consuming the per-day budget.)

  // ---- Set dedup marker (24h TTL) ----
  await env.FORMAT_TELEMETRY.put(dedupKey, "1", { expirationTtl: 86400 });

  // ---- Contribution notification (admin alert; never affects ingest) ----
  // Fires only for worth-a-look submissions (unknown nonzero prefix, or
  // any full-file upload); silent otherwise, and send failures are caught
  // inside. waitUntil so the POST response is never delayed by mail.
  ctx.waitUntil(
    sendContributionNotification(env, {
      key,
      prefix: data.prefix,
      status: data.status,
      hasFullFile: data.fullFile !== null,
      header: data.header,
      extension: data.extension ?? undefined,
    }),
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ---- POST ingestion: content-type + body parse + rate limit + validate + persist ----
export async function handlePostIngestion(
  env: Env,
  request: Request,
  corsHeaders: Record<string, string>,
  ctx: ExecutionContext,
): Promise<Response> {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.startsWith("application/json")) {
    return new Response(JSON.stringify({ error: "expected application/json" }), {
      status: 415,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const bodyText = await request.text();
  // Byte-accurate cap: bodyText.length counts UTF-16 units, so a
  // multi-byte (e.g. CJK) body could slip ~3x the intended limit past
  // JSON.parse (CWE-770). Measure true UTF-8 bytes instead.
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let body: TelemetryBody;
  try {
    body = JSON.parse(bodyText) as TelemetryBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  const fp = await fingerprint(request, env);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  // Per-IP keys use a hash of the IP alone — the raw IP is never stored.
  const ipHash = await ipFingerprint(env, ip);
  const today = new Date().toISOString().slice(0, 10);
  // Day-scoped marker prefixes, counted not incremented (race-free caps).
  const ratePrefix = `rate:${fp}:${today}:`;
  const ipRatePrefix = `rate-ip:${ipHash}:${today}:`;

  // ---- Rate limit check (per fp + per IP) — race-free list counts ----
  const [rateCount, ipRateCount] = await Promise.all([
    countKeys(env, ratePrefix, RATE_LIMIT_PER_DAY),
    countKeys(env, ipRatePrefix, RATE_LIMIT_PER_IP_PER_DAY),
  ]);
  if (rateCount >= RATE_LIMIT_PER_DAY) {
    return new Response(JSON.stringify({ ok: false, error: "rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (ipRateCount >= RATE_LIMIT_PER_IP_PER_DAY) {
    return new Response(JSON.stringify({ ok: false, error: "rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  // Rate markers are written for EVERY request that passes the rate
  // check — before dedup/validation early-returns — so an attacker can't
  // replay dedup'd or invalid POSTs forever without consuming the
  // 100/500-per-day budget (each such request still costs body read +
  // KV list scans + fingerprint).
  const rateUuid = crypto.randomUUID();
  await env.FORMAT_TELEMETRY.put(`${ratePrefix}${rateUuid}`, "1", {
    expirationTtl: 86400 * 2,
  });
  await env.FORMAT_TELEMETRY.put(`${ipRatePrefix}${rateUuid}`, "1", {
    expirationTtl: 86400 * 2,
  });

  // ---- Validate prefix (hard error) ----
  const prefix = body.prefix;
  if (typeof prefix !== "number" || prefix < 0 || prefix > 99999) {
    return new Response(JSON.stringify({ error: "invalid prefix" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const validated = validateEntry(body);
  return persistRecord(env, validated, fp, ipHash, corsHeaders, ctx);
}
