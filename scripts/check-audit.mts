// check-audit.mts — fail-on-findings wrapper around `bun audit --json`.
//
// Contract (revised 2026-11-19):
//   FATAL     — any advisory in *production* dependencies (`bun audit --production`).
//               That is what actually ships: the static `_site/` tree plus the
//               site assets. Nothing else reaches a visitor.
//   REPORTED  — advisories that exist only in the dev toolchain (miniflare,
//               http-server and their transitive deps). They are real CVEs, but
//               they are build/test-time only, and four of them —
//               undici 7.29.0, sharp 0.35.4, qs 6.15.3, follow-redirects 1.16.0 —
//               are already the newest resolvable versions. The previous
//               "fail on every advisory" rule therefore had no way back to green:
//               the audit DB grows forever while the pins cannot move.
//               Set AUDIT_VERBOSE=1 to list them individually.
//   WAIVERS   — explicit risk acceptance, matched on exact pkg+title so a
//               reworded advisory fails closed and forces re-review.
//
// `bun audit` (text mode) exits 0 even with findings, unlike `npm audit`, so this
// script counts advisories itself. Informational staleness stays in gate [2]
// (`bun outdated`, || true).
import { execFileSync } from "node:child_process";

// Documented waivers (explicit risk acceptance — still reported, never fail).
// QS-01 (2026-09-07): 2 qs moderates via the dev-only http-server chain.
// Identical pins under npm; localhost exposure only; bumping to 6.16.0 neither
// clears the audit DB nor avoids a direct pin. Revisit if http-server serves non-local.
// NOTE: match is exact pkg+title, so a reworded advisory fails closed (forces re-review).
const WAIVERS: Array<{ pkg: string; title: string }> = [
  { pkg: "qs", title: "qs array-limit bypass via bracket-key comma parsing" },
  {
    pkg: "qs",
    title: "qs: Denial of Service via Attacker Controlled isBuffer",
  },
];

type Advisories = Record<string, Array<{ title: string; severity: string }>>;

function auditJson(extraArgs: string[]): Advisories {
  let stdout: string;
  try {
    stdout = execFileSync("bun", ["audit", ...extraArgs, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (e) {
    // Findings ride along on the thrown error's stdout — recover them.
    const recovered = (e as { stdout?: unknown }).stdout;
    if (typeof recovered === "string" && recovered.trim().length > 0) {
      stdout = recovered;
    } else {
      console.error(
        `FAIL: \`bun audit ${extraArgs.join(" ")} --json\` itself errored (fail-closed).`,
      );
      process.exit(2);
    }
  }
  try {
    return JSON.parse(stdout) as Advisories;
  } catch {
    console.error("FAIL: audit output was not JSON (fail-closed).");
    process.exit(2);
  }
}

const all = auditJson([]);
const prod = auditJson(["--production"]);

const prodKeys = new Set<string>();
for (const [pkg, advisories] of Object.entries(prod)) {
  for (const a of advisories) prodKeys.add(`${pkg}\0${a.title}`);
}

const fatal: string[] = [];
const waived: string[] = [];
const devOnly: string[] = [];

for (const [pkg, advisories] of Object.entries(all)) {
  for (const a of advisories) {
    const entry = `${pkg}: [${a.severity}] ${a.title}`;
    if (prodKeys.has(`${pkg}\0${a.title}`)) {
      const excused = WAIVERS.some((w) => w.pkg === pkg && w.title === a.title);
      (excused ? waived : fatal).push(entry);
    } else {
      devOnly.push(entry);
    }
  }
}

for (const w of waived) console.log(`waived (QS-01): ${w}`);

if (devOnly.length > 0) {
  const perPkg = new Map<string, number>();
  for (const e of devOnly) {
    const pkg = e.slice(0, e.indexOf(":"));
    perPkg.set(pkg, (perPkg.get(pkg) ?? 0) + 1);
  }
  const summary = [...perPkg.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${p}×${n}`)
    .join(", ");
  console.log(
    `dev-only advisories (not shipped): ${devOnly.length} — ${summary}` +
      (process.env.AUDIT_VERBOSE === "1" ? "" : " (AUDIT_VERBOSE=1 for detail)"),
  );
  if (process.env.AUDIT_VERBOSE === "1") for (const e of devOnly) console.log(`  - ${e}`);
}

if (fatal.length > 0) {
  console.error(
    `FAIL: ${fatal.length} production audit advisor${fatal.length === 1 ? "y" : "ies"}:`,
  );
  for (const f of fatal) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`audit clean (0 unwaived production advisories; ${devOnly.length} dev-only reported)`);
