// Cloudflare Worker — Cryptographic and utility functions
// Pure functions + KV helpers; no request routing.

import type { Env } from "./types";

// Keyed pseudonym (HMAC-SHA256) for IP-derived identifiers. A plain SHA-256
// truncation is NOT a privacy pseudonym for IPv4: 2^32 space is trivially
// brute-forceable offline, so anyone with KV read access could recover every
// submitter's raw IP from the per-IP key names (CWE-359). Keying the hash
// with a server secret (IP_HMAC_SECRET, falling back to ADMIN_TOKEN) makes it
// cryptographically irreversible without the secret — a KV dump/backup/leak
// reveals nothing. 128-bit truncation also makes cross-IP collisions
// negligible (the old 64-bit truncation had ~40% collision over the full
// IPv4 space, contaminating rate-limit keys).
export async function keyedPseudonym(env: Env, data: string): Promise<string> {
  const secret = env.IP_HMAC_SECRET || env.ADMIN_TOKEN || "unset";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(sig))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Simple fingerprint from IP + User-Agent hash. Keyed (see keyedPseudonym):
// the fingerprint in stored records must not be reversible to the raw IP.
export async function fingerprint(request: Request, env: Env): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ua = request.headers.get("User-Agent") || "";
  return keyedPseudonym(env, `${ip}:${ua}`);
}

// Privacy (CWE-359): per-IP counter keys pseudonymize the IP alone (UA
// excluded so the counter is stable per IP) — the raw IP is never written to
// KV key names, and the keyed hash cannot be reversed offline. The old
// `records-ip:<ip>:<date>` / `ratelimit-ip:<ip>:<date>` keys stored every
// submitter's raw IP in operator-accessible KV for 48h.
export function ipFingerprint(env: Env, ip: string): Promise<string> {
  return keyedPseudonym(env, `ip:${ip}`);
}

// Race-free counter: count keys under a day-scoped prefix. KV has no atomic
// increment, so read-then-write counters drift under concurrency — lost
// updates made the old cap/rate counters permanently bypassable (CWE-362).
// Counting actual per-request/per-record keys self-corrects: the count is
// always derived from what is actually stored.
export async function countKeys(
  env: Env,
  prefix: string,
  max: number,
): Promise<number> {
  let count = 0;
  let cursor: string | null | undefined;
  do {
    const res = await env.FORMAT_TELEMETRY.list({
      prefix,
      ...(cursor !== undefined ? { cursor } : {}),
      limit: 1000,
    });
    count += res.keys.length;
    if (count >= max) return count;
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return count;
}

// Validate a full_file base64 payload: correct alphabet, correct padding,
// and a decoded size within the 8 MiB app limit. A length-only check let
// arbitrary garbage be persisted (CWE-20) and fed storage-abuse.
export function validBase64Payload(s: string): boolean {
  if (s.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return false;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  const decoded = (s.length / 4) * 3 - pad;
  return decoded <= 8 * 1024 * 1024;
}

// Constant-time token comparison (CWE-208): hash both sides to a fixed 32
// bytes first so an early length mismatch cannot leak via timing, then
// XOR-compare every byte.
export async function tokensEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(b)),
  ]);
  const av = new Uint8Array(ha);
  const bv = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < av.length; i++) {
    const x = av[i];
    const y = bv[i];
    if (x === undefined || y === undefined) return false;
    diff |= x ^ y;
  }
  return diff === 0;
}

// Escape every value that will be interpolated into dashboard HTML. The
// public POST endpoint accepts arbitrary header / issue_detail text, so any
// unescaped record field is a stored-XSS primitive against the admin
// dashboard (a crafted submission could read the ?token= URL). This is a
// worker, not a browser — plain string replacement, no DOM.
export function escapeHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
