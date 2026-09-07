// check-audit.mts — fail-on-findings wrapper around `bun audit --json`.
//
// `bun audit` (text mode) exits 0 even when advisories exist, unlike
// `npm audit`. check-local gate [1] contracts FAIL-on-any-vulnerability,
// so this script counts advisories itself: any advisory = exit 1.
// (`bun audit --json` also exits nonzero on findings; the JSON on its
// stdout is still parsed — exit codes alone are not the contract.)
// Informational staleness stays in gate [2] (`bun outdated`, || true).
import { execFileSync } from "node:child_process";

function auditJson(): string {
  try {
    return execFileSync("bun", ["audit", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (e) {
    // Findings ride along on the thrown error's stdout — recover them.
    const stdout = (e as { stdout?: unknown }).stdout;
    if (typeof stdout === "string" && stdout.trim().length > 0) return stdout;
    console.error("FAIL: `bun audit --json` itself errored (fail-closed).");
    process.exit(2);
  }
}

const data = JSON.parse(auditJson()) as Record<string, Array<{ title: string; severity: string }>>;
const findings: string[] = [];
for (const [pkg, advisories] of Object.entries(data)) {
  for (const a of advisories) findings.push(`${pkg}: [${a.severity}] ${a.title}`);
}
if (findings.length > 0) {
  console.error(`FAIL: ${findings.length} audit advisor${findings.length === 1 ? "y" : "ies"}:`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("audit clean (0 advisories)");
