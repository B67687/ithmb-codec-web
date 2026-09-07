// Cloudflare Worker — Entry point and request router
// Decomposed from monolithic worker.ts into: types, crypto, dashboard, validation, persistence.

import { tokensEqual } from "./crypto";
import { buildDashboardHtml } from "./dashboard";
import { handlePostIngestion } from "./persistence";
import type { Env, StoredRecord } from "./types";

// ---- CORS preflight ----
function handleOptions(corsHeaders: Record<string, string>): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// ---- Dashboard HTML (GET) ----
async function handleDashboardGet(
  env: Env,
  request: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Dashboard auth: Authorization: Bearer <ADMIN_TOKEN> ONLY. The legacy
  // ?token=<ADMIN_TOKEN> query path is gone — a bearer credential must
  // never ride in URLs (browser history, access logs, Referer) (CWE-200).
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token && (await tokensEqual(token, env.ADMIN_TOKEN))) {
    // ---- HTML dashboard ----
    const allRecords: StoredRecord[] = [];
    let cursor: string | null | undefined;
    let scanned = 0;
    // Bounded scan: at most 5000 records. Records are slim (full-file
    // payloads live under their own `fullfile_` key), so this is bounded
    // memory/CPU work no matter how large the store grows (CWE-400).
    const MAX_SCAN = 5000;
    do {
      const list = await env.FORMAT_TELEMETRY.list({
        prefix: "fmt_",
        ...(cursor !== undefined ? { cursor } : {}),
        limit: 1000,
      });
      for (const key of list.keys) {
        if (scanned >= MAX_SCAN) break;
        const value = await env.FORMAT_TELEMETRY.get(key.name);
        if (value) {
          try {
            const record = JSON.parse(value) as StoredRecord;
            allRecords.push(record);
          } catch (err) {
            // Unparseable record (legacy write or corrupt KV value). Skip
            // it — the dashboard is best-effort over the store — but surface
            // the key in Workers Logs so a systematic corruption is
            // detectable instead of silently vanishing.
            console.error(
              `telemetry: skipping unparseable record at key "${key.name}": ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        scanned++;
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor && scanned < MAX_SCAN);

    // Compute stats
    const total = allRecords.length;
    const prefixCounts: Record<string, number> = {};
    const statuses: Record<string, number> = {};
    let fullFileCount = 0;
    for (const r of allRecords) {
      const p = String(r.prefix);
      prefixCounts[p] = (prefixCounts[p] || 0) + 1;
      const s = r.status || "unknown";
      statuses[s] = (statuses[s] || 0) + 1;
      if (r.fullFile || r.hasFullFile) fullFileCount++;
    }
    const uniquePrefixes = Object.keys(prefixCounts).length;
    const unknownFailed = (statuses["unknown"] || 0) + (statuses["known-failed"] || 0);

    // Sort prefix counts descending
    const prefixEntries = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]);

    // Recent 50 sorted by timestamp descending
    const recent50 = allRecords
      .filter((r): r is StoredRecord & { timestamp: string } => Boolean(r.timestamp))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);

    const html = buildDashboardHtml({
      total,
      uniquePrefixes,
      unknownFailed,
      fullFileCount,
      prefixEntries,
      recent50,
    });

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Defense-in-depth for the stored-XSS fix: even if an unescaped
        // field ever slips through, no script can run and the admin
        // page cannot be framed (token exfiltration / clickjacking).
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        // The token arrives via an Authorization header; these stop it
        // leaking through the browser cache or a Referer (CWE-200).
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        ...corsHeaders,
      },
    });
  }

  // Every other GET — including the old public JSON counts endpoint — is
  // private: nothing in the app reads counts (the only telemetry call in
  // ithmb-decoder/*.ts is the POST submit), and the worker promises
  // "No public exposure". Without a valid bearer token everything else
  // returns 401 (CWE-200: bearer never rides in URLs).
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS: echo the request origin back when it matches the allowlist
    // (production domain + any localhost/127.0.0.1 dev origin, any port).
    // Non-allowed origins get the production domain, so browsers block them
    // (anti-abuse: random sites can't POST from browsers; curl/server code
    // is unaffected by CORS anyway).
    const requestOrigin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin":
        requestOrigin === "https://ithmb-codec.dev" ||
        (requestOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin))
          ? requestOrigin
          : "https://ithmb-codec.dev",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return handleOptions(corsHeaders);
    }
    if (request.method === "GET") {
      return handleDashboardGet(env, request, corsHeaders);
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }
    try {
      return await handlePostIngestion(env, request, corsHeaders);
    } catch {
      return new Response(JSON.stringify({ error: "internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
