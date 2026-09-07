# Telemetry Worker — Private Format Data Collection

Deploys a Cloudflare Worker that stores format metadata submissions from the WASM decoder into KV. No public exposure. No email required.

## Tests

Committed integration test (miniflare/workerd, in-memory KV, no external processes):

```bash
bun workers/telemetry/test-worker.ts   # or: bun run test:worker
```

Covers: valid + garbage-base64 POSTs, Bearer-only auth (`?token=` dead), no raw IP in KV keys, `fullfile_` payload separation, uuid record keys.

## Deployment

1. Install [Node.js](https://nodejs.org/) (if not already)
2. `npm install -g wrangler`
3. `wrangler login`
4. Create the KV namespace:
   ```bash
   wrangler kv:namespace create FORMAT_TELEMETRY
   ```
   Copy the returned ID into `wrangler.toml`
5. Deploy:
   ```bash
   wrangler deploy
   ```
6. The worker URL will be `https://ithmb-telemetry.YOUR_ACCOUNT.workers.dev`
7. Add `ADMIN_TOKEN` in the Cloudflare dashboard (Workers & Pages → ithmb-telemetry → Settings → Variables) — gates the dashboard below

## API

### POST /

```json
{
  "prefix": 1067,
  "width": 720,
  "height": 480,
  "fileSize": 691200,
  "status": "success",
  "header": null
}
```

### Status values

| status                       | Meaning                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `success`                    | File decoded successfully — client sends prefix + header (no dimensions) via the report modal |
| `known-failed`               | Known prefix but decode failed — 16-byte header sent                                          |
| `unknown`                    | Unknown prefix — 16-byte header sent                                                          |
| `looks-good` / `looks-wrong` | Report-modal issue types from the success path                                                |

### Optional fields

| field          | Meaning                                                                                        | Cap                         |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| `full_file`    | Base64 of the complete file (checkbox "Upload full file"); must be valid base64 ≤ 8 MB decoded | 11,184,812 chars ≈ 8 MB raw |
| `issue`        | One of: `color_space`, `dimensions`, `stride`, `offset`, `byte_order`, `other`                 | ≤ 40 chars                  |
| `issue_detail` | Free-text explanation                                                                          | ≤ 200 chars                 |
| `extension`    | `ipm` or `ithmb`                                                                               | —                           |

## Limits (anti-abuse)

- **Request body:** ≤ 13 MB **UTF-8 bytes** (`MAX_BODY_BYTES`; measured on the wire, not UTF-16 units); larger → `413 body too large`
- **Rate limit:** 100 POSTs / day / fingerprint (IP + User-Agent hash) and 500 / day / IP — enforced by counting day-scoped per-request marker keys (self-correcting; a concurrent burst can overshoot by up to the in-flight concurrency — KV has no atomic counters)
- **Records:** max 50 stored / day / fingerprint and 250 / day / IP, enforced by counting per-record marker keys; dedup per `prefix+status` + full-file flag (`:h`/`:f`) for 24 h
- **Privacy:** the raw IP is **never stored in the clear** — per-IP keys use an HMAC-SHA256 keyed pseudonym (server secret `IP_HMAC_SECRET`, falling back to `ADMIN_TOKEN`; set in the CF dashboard). Without the secret the hash is cryptographically irreversible — a KV dump/backup/leak reveals nothing — and the 128-bit truncation keeps cross-IP collisions negligible
- **Records are slim:** `full_file` payloads are stored under a separate `fullfile_<uuid>` key so dashboard/JSON renders never fetch multi-MB values; `hasFullFile` tracks presence
- **Batch endpoint:** removed — the single-record path (`POST /`) is the only live ingest path.
- **Retention:** records + full-file payloads expire after 365 days; rate/dedup/record markers after 1-2 days
- **Keep `FULL_FILE_MAX_BYTES` in `ithmb-decoder/card-failure-ui.js` in sync**: the client disables full-file upload above 8 MB raw (the app's own decode limit), matching the worker's 11,184,812-char field cap

## Reading Data

```bash
# List all keys
wrangler kv:key list --binding=FORMAT_TELEMETRY

# Get a specific record
wrangler kv:key get --binding=FORMAT_TELEMETRY <key>

# Bulk export
wrangler kv:key list --binding=FORMAT_TELEMETRY > keys.json
```

## Dashboard

The worker serves a read-only admin dashboard at `GET /dashboard`:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://ithmb-telemetry.ithmb-codec.workers.dev/dashboard
```

- **Auth:** the `Authorization: Bearer <ADMIN_TOKEN>` header (constant-time compare) must match the worker's `ADMIN_TOKEN` env var; without it the request is rejected. The legacy `?token=` query path was removed — a bearer credential must never ride in URLs (browser history, access logs, Referer).
- **Headers:** `Cache-Control: no-store` + `Referrer-Policy: no-referrer` (token leak prevention) + CSP + `nosniff`
- **Scan is bounded** (5000 records) and reads slim records only — full-file payloads are never fetched during a render
- Shows: total submissions, unique prefixes, unknown vs known-failed counts, full-file count, prefix distribution, recent 50 records
- `GET /` is also **token-gated** (same `Authorization: Bearer <ADMIN_TOKEN>`) — the JSON prefix-counts endpoint was previously public but nothing in the app reads it (the only telemetry call is the POST submit), so the entire read surface is now private. Returns 401 without a valid token.
