// Cloudflare Worker — Dashboard HTML builder

import { escapeHtml } from "./crypto";
import type { StoredRecord } from "./types";

export function buildDashboardHtml({
  total,
  uniquePrefixes,
  unknownFailed,
  fullFileCount,
  prefixEntries,
  recent50,
}: {
  total: number;
  uniquePrefixes: number;
  unknownFailed: number;
  fullFileCount: number;
  prefixEntries: [string, number][];
  recent50: StoredRecord[];
}): string {
  // ALL interpolated record fields are attacker-controlled (public POST,
  // only length/shape-checked). Escape every one — defense in depth even
  // for fields that are validated on ingest (legacy records may predate it).
  const esc = escapeHtml;

  const prefixRows = prefixEntries
    .map(([prefix, count]) => `<tr><td>${esc(prefix)}</td><td>${esc(count)}</td></tr>`)
    .join("");

  const recentRows = recent50
    .map((r) => {
      const status = r.status || "unknown";
      const cls = status;
      const dims = r.width && r.height ? `${esc(r.width)} \u00d7 ${esc(r.height)}` : "\u2014";
      const fileSize = r.fileSize != null ? `${esc(r.fileSize)}` : "\u2014";
      const header = r.header
        ? r.header.length > 32
          ? esc(r.header.slice(0, 32)) + "..."
          : esc(r.header)
        : "\u2014";
      const fullFile = r.fullFile || r.hasFullFile ? "Yes" : "No";
      const time = r.timestamp ? esc(new Date(r.timestamp).toLocaleString()) : "\u2014";
      const highlight =
        status === "unknown" || status === "known-failed" ? ' class="warn-row"' : "";
      const issueCell = r.issue
        ? `<span class="badge badge-${esc(r.issue)}">${esc(r.issue)}</span>`
        : "\u2014";
      const issueDetailCell = r.issueDetail
        ? r.issueDetail.length > 40
          ? esc(r.issueDetail.slice(0, 40)) + "..."
          : esc(r.issueDetail)
        : "\u2014";
      const extCell = r.extension ? esc(r.extension) : "\u2014";
      return `<tr${highlight}><td>${time}</td><td>${
        r.prefix != null ? esc(r.prefix) : "\u2014"
      }</td><td><span class="badge badge-${esc(cls)}">${esc(status)}</span></td><td>${dims}</td><td>${fileSize}</td><td>${header}</td><td>${fullFile}</td><td>${issueCell}</td><td>${issueDetailCell}</td><td>${extCell}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Format Telemetry Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f7;color:#1d1d1f;padding:40px 20px}
h1{font-size:28px;font-weight:600;margin-bottom:8px}
.subtitle{color:#6e6e73;margin-bottom:32px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:40px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card h3{font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:#6e6e73;margin-bottom:8px}
.card .value{font-size:32px;font-weight:700}
h2{font-size:20px;font-weight:600;margin:32px 0 12px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th{background:#f5f5f7;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6e6e73;padding:12px 16px;text-align:left;border-bottom:1px solid #e8e8ed}
td{padding:10px 16px;border-bottom:1px solid #e8e8ed;font-size:14px}
tr:last-child td{border-bottom:none}
tr.warn-row{background:#fffde7}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500}
.badge-success,.badge-looks-good{background:#e8f5e9;color:#2e7d32}
.badge-unknown,.badge-looks-wrong{background:#fff3e0;color:#e65100}
.badge-known-failed{background:#ffebee;color:#c62828}
</style>
</head>
<body>
<h1>Format Telemetry Dashboard</h1>
<p class="subtitle">Submission overview and recent activity</p>
<div class="stats">
<div class="card"><h3>Total Submissions</h3><div class="value">${total}</div></div>
<div class="card"><h3>Unique Prefixes</h3><div class="value">${uniquePrefixes}</div></div>
<div class="card"><h3>Unknown / Failed</h3><div class="value">${unknownFailed}</div></div>
<div class="card"><h3>Full File Uploads</h3><div class="value">${fullFileCount}</div></div>
</div>
<h2>Prefix Distribution</h2>
<table>
<thead><tr><th>Prefix</th><th>Count</th></tr></thead>
<tbody>${prefixRows}</tbody>
</table>
<h2>Recent Submissions (50)</h2>
<table>
<thead><tr><th>Time</th><th>Prefix</th><th>Status</th><th>Dimensions</th><th>File Size</th><th>Header</th><th>Full File</th><th>Issue</th><th>Issue Detail</th><th>Ext</th></tr></thead>
<tbody>${recentRows}</tbody>
</table>
</body>
</html>`;
}
