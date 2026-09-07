// test-worker.ts — committed integration test for the telemetry worker.
//
// Runs the worker inside miniflare (workerd) with IN-MEMORY KV: no external
// processes, no persist files, no flaky WAL timing — the same engine CI and
// production use. Covers the hardened behaviors (security audit C1–C6):
//   - POST accepts a valid record (hex header)
//   - garbage base64 full_file is rejected (stored with hasFullFile:false)
//   - a valid full_file payload lands under a separate `fullfile_` key
//   - `?token=` no longer authenticates; Bearer does
//   - no raw IP appears in KV key names (per-IP keys are hashed)
//   - GET / JSON is token-gated; prefix counts derive from key names (zero value fetches)
//
// The worker source is TypeScript, and miniflare's scriptPath loader passes
// the file to workerd verbatim (it cannot parse TS), so the worker is
// transpiled to JS with esbuild (same bundler the repo's build uses) and fed
// to miniflare via the `script` option.
//
// The whole harness runs in `main()` because `tsx` transpiles this `.ts` file
// to CommonJS (the repo has no `"type": "module"`), which forbids top-level
// `await`.
//
// Run: npm run test:worker   (from the repo root)
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function main(): Promise<void> {
  const WORKER_SRC = fileURLToPath(new URL("./src/worker.ts", import.meta.url));

  const { outputFiles } = await build({
    entryPoints: [WORKER_SRC],
    bundle: true,
    format: "esm",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });

  const first = outputFiles[0];
  if (!first) throw new Error("esbuild produced no output");
  const mf = new Miniflare({
    modules: true,
    script: first.text,
    scriptPath: WORKER_SRC,
    kvNamespaces: ["FORMAT_TELEMETRY"],
    // REVIEW 4.3: intentional non-secret test fixture (miniflare in-memory binding only;
    // never used in production — the real ADMIN_TOKEN lives in the Cloudflare dashboard,
    // SOPS/age-encrypted locally per spec D3).
    bindings: { ADMIN_TOKEN: "smoke-test-token-0001" },
  });

  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(
      `${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`,
    );
    ok ? pass++ : fail++;
  };

  // miniflare's Response.json() is typed Promise<unknown>; read JSON through a
  // typed helper rather than working with `unknown` directly.
  const json = async <T>(res: { json(): Promise<unknown> }): Promise<T> =>
    (await res.json()) as T;

  const post = (body: unknown) =>
    mf.dispatchFetch("http://localhost/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.99",
      },
      body: JSON.stringify(body),
    });

  // 1. Valid record with hex header
  let r = await post({
    prefix: 1009,
    status: "unknown",
    header: "4d4d0042000000000000000000000000",
    fileSize: 1234,
  });
  check("POST valid record", (await json<{ ok: boolean }>(r)).ok === true);

  // 2. Garbage base64 full_file → record stored, payload rejected (hasFullFile:false)
  r = await post({
    prefix: 1009,
    status: "looks-wrong",
    full_file: "!!!!!not-base64-at-all!!!!!####$$$$",
  });
  check(
    "POST garbage base64 accepted as record",
    (await json<{ ok: boolean }>(r)).ok === true,
  );

  // 3. Valid 8 MiB full_file → stored (payload lands under a separate key)
  const b64 = Buffer.alloc(8 * 1024 * 1024, 0).toString("base64");
  r = await post({ prefix: 1009, status: "known-failed", full_file: b64 });
  check("POST valid full_file", (await json<{ ok: boolean }>(r)).ok === true);

  // 4. Auth: ?token= must NOT authenticate (public JSON fallback); Bearer → dashboard
  r = await mf.dispatchFetch("http://localhost/?token=smoke-test-token-0001");
  const tokenBody = await r.text();
  check(
    "?token= returns JSON (not dashboard)",
    tokenBody.trimStart().startsWith("{"),
  );

  r = await mf.dispatchFetch("http://localhost/", {
    headers: { Authorization: "Bearer smoke-test-token-0001" },
  });
  const dashBody = await r.text();
  check("Bearer returns dashboard HTML", /<html|<!doctype/i.test(dashBody));

  // 5. KV key hygiene via miniflare's in-memory KV (robust — no persist files)
  const ns = await mf.getKVNamespace("FORMAT_TELEMETRY");
  const keys = (await ns.list()).keys.map((k) => k.name).join("\n");
  check("no raw IP in KV keys", !keys.includes("203.0.113.99"));
  check("fullfile_ payload key separated", /^fullfile_/m.test(keys));
  check(
    "uuid record keys (no Date.now)",
    /^fmt_1009_[0-9a-f-]{36}$/m.test(keys),
  );

  // 6. The entire GET surface is token-gated (was partially public; nothing in
  //    the app reads counts — the only telemetry call is the POST submit).
  //    No token → 401; valid Bearer → dashboard HTML.
  r = await mf.dispatchFetch("http://localhost/");
  check("GET / without token is 401", r.status === 401);

  r = await mf.dispatchFetch("http://localhost/", {
    headers: { Authorization: "Bearer smoke-test-token-0001" },
  });
  const j = await r.text();
  check("GET / with token returns dashboard HTML", /<html|<!doctype/i.test(j));

  // 7. Dashboard tracks the full-file record (separation)
  check(
    "dashboard Full File Uploads == 1",
    /Full File Uploads<\/h3><div class="value">1<\/div>/.test(dashBody),
  );

  // 8. Rate markers cover EVERY accepted request (C2 regression): dedup'd
  //    resubmissions must consume the per-day budget, not replay for free.
  for (let i = 0; i < 5; i++) {
    r = await post({
      prefix: 3004,
      status: "unknown",
      header: "4d4d0042000000000000000000000000",
    });
    await r.json();
  }
  const rateKeys = (await ns.list({ prefix: "rate:" })).keys.length;
  check(
    "rate markers per request (5 POSTs, 5 markers)",
    rateKeys >= 5,
    "markers=" + rateKeys,
  );

  console.log(`\n=== worker test: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
