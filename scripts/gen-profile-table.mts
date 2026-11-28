#!/usr/bin/env bun
/**
 * gen-profile-table.mts — regenerate ithmb-decoder/profiles.ts from the codec.
 *
 * WHY: the browser cannot ask the WASM binding for per-profile frame sizes, and
 * the web decoder needs them for two data-integrity decisions (MASTER-TRIAGE
 * MT-003/MT-004):
 *
 *   1. MT-003: replicate the codec's tier-2 size heuristic so an unknown-prefix
 *      payload of a "matching" length can be refused at the web boundary instead
 *      of being rendered as a fabricated success.
 *   2. MT-004: clip a multi-frame payload to one frame before decoding so the
 *      RGB565/RGB555 stride is the per-frame width, not N x width.
 *
 * The table must mirror the codec, never drift, and be reviewable. It is
 * generated (not hand-maintained) and the unit tests assert the expected prefix
 * set, so a codec profile change shows up as a deliberate test/table update.
 *
 * Source of truth:
 *   <codec>/crates/ithmb-core/data/profiles.json   (53 active profiles)
 *   <codec>/crates/ithmb-core/src/profile_db.rs    (Nano 7G alternates,
 *                                                  prefix 1044 disabled)
 *
 * Usage (from the web repo):
 *   bun scripts/gen-profile-table.mts ../Ithmb-Codec/crates/ithmb-core/data/profiles.json
 *   bun scripts/gen-profile-table.mts            # tries the sibling default
 *
 * Dev-only helper: excluded from the public mirror (.publicignore) because it
 * assumes a sibling checkout of the codec repo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface CodecProfile {
  prefix: number;
  frame_byte_length: number;
  is_padded?: boolean;
  slot_size?: number;
}

/** Prefixes the codec deliberately disables (profile_db.rs DISABLED_PREFIXES). */
const DISABLED_PREFIXES = new Set([1044]);

/** Nano 7G device-override strides from profile_db.rs load_builtin(). */
const ALTERNATES: Record<number, number[]> = {
  1013: [5000],
  1015: [6728],
  1016: [6498],
};

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "ithmb-decoder", "profiles.ts");

function resolveSourcePath(): string {
  const arg = process.argv[2];
  if (arg) return arg;
  return join(ROOT, "..", "Ithmb-Codec", "crates", "ithmb-core", "data", "profiles.json");
}

const source = resolveSourcePath();
if (!existsSync(source)) {
  console.error(`gen-profile-table: profiles.json not found at ${source}`);
  console.error("pass the path explicitly: bun scripts/gen-profile-table.mts <path>");
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(source, "utf8")) as CodecProfile[];
const profiles = parsed
  .filter((p) => !DISABLED_PREFIXES.has(p.prefix))
  .sort((a, b) => a.prefix - b.prefix);

if (profiles.length === 0) {
  console.error("gen-profile-table: the source contained no active profiles");
  process.exit(1);
}

const lines: string[] = [];
lines.push("// ithmb-decoder/profiles.ts — GENERATED FILE, do not edit by hand.");
lines.push("//");
lines.push("// Source: ithmb-codec `crates/ithmb-core/data/profiles.json` (active profiles)");
lines.push("// plus the Nano 7G alternate strides in `crates/ithmb-core/src/profile_db.rs`.");
lines.push("// Prefix 1044 is disabled upstream (iOpenPod #81) and must stay absent here.");
lines.push("// Regenerate: bun scripts/gen-profile-table.mts <path/to/profiles.json>");
lines.push("//");
lines.push("// frameBytes  = frame_byte_length — the value the codec's tier-2 size heuristic");
lines.push("//               compares against, so the web boundary can detect a heuristic");
lines.push("//               match before it is painted as a successful decode (MT-003).");
lines.push("// frameStride = bytes of one frame inside a multi-frame container: slot_size");
lines.push("//               for padded profiles, else frame_byte_length. Used to clip a");
lines.push("//               multi-frame payload to frame 0 (MT-004).");
lines.push("// alternates  = Nano 7G device-override strides, selected by payload length.");
lines.push("export interface ProfileInfo {");
lines.push("  frameBytes: number;");
lines.push("  frameStride: number;");
lines.push("  alternates?: number[];");
lines.push("}");
lines.push("");
lines.push("/** The 53 active codec profiles, keyed by big-endian format prefix. */");
lines.push("export const PROFILES: Record<number, ProfileInfo> = {");
for (const p of profiles) {
  const frameBytes = p.frame_byte_length;
  const frameStride = p.is_padded === true && (p.slot_size ?? 0) > 0 ? p.slot_size! : frameBytes;
  const alt = ALTERNATES[p.prefix];
  const altPart = alt ? `, alternates: [${alt.join(", ")}]` : "";
  lines.push(
    `  ${p.prefix}: { frameBytes: ${frameBytes}, frameStride: ${frameStride}${altPart} },`,
  );
}
lines.push("};");
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(
  `gen-profile-table: wrote ${profiles.length} profiles to ${OUT.replace(`${ROOT}/`, "")}`,
);
