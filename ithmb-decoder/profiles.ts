// ithmb-decoder/profiles.ts — GENERATED FILE, do not edit by hand.
//
// Source: ithmb-codec `crates/ithmb-core/data/profiles.json` (active profiles)
// plus the Nano 7G alternate strides in `crates/ithmb-core/src/profile_db.rs`.
// Prefix 1044 is disabled upstream (iOpenPod #81) and must stay absent here.
// Regenerate: bun scripts/gen-profile-table.mts <path/to/profiles.json>
//
// frameBytes  = frame_byte_length — the value the codec's tier-2 size heuristic
//               compares against, so the web boundary can detect a heuristic
//               match before it is painted as a successful decode (MT-003).
// frameStride = bytes of one frame inside a multi-frame container: slot_size
//               for padded profiles, else frame_byte_length. Used to clip a
//               multi-frame payload to frame 0 (MT-004).
// alternates  = Nano 7G device-override strides, selected by payload length.
export interface ProfileInfo {
  frameBytes: number;
  frameStride: number;
  alternates?: number[];
}

/** The 53 active codec profiles, keyed by big-endian format prefix. */
export const PROFILES: Record<number, ProfileInfo> = {
  1005: { frameBytes: 12800, frameStride: 12800 },
  1007: { frameBytes: 829440, frameStride: 829440 },
  1009: { frameBytes: 2520, frameStride: 2520 },
  1010: { frameBytes: 115200, frameStride: 115200 },
  1013: { frameBytes: 77440, frameStride: 77440, alternates: [5000] },
  1015: { frameBytes: 22880, frameStride: 22880, alternates: [6728] },
  1016: { frameBytes: 39200, frameStride: 39200, alternates: [6498] },
  1017: { frameBytes: 6272, frameStride: 6272 },
  1019: { frameBytes: 691200, frameStride: 691200 },
  1020: { frameBytes: 77440, frameStride: 77440 },
  1023: { frameBytes: 46464, frameStride: 46464 },
  1024: { frameBytes: 153600, frameStride: 153600 },
  1027: { frameBytes: 20000, frameStride: 20000 },
  1028: { frameBytes: 20000, frameStride: 20000 },
  1029: { frameBytes: 80000, frameStride: 80000 },
  1031: { frameBytes: 3528, frameStride: 3528 },
  1032: { frameBytes: 3108, frameStride: 3108 },
  1036: { frameBytes: 4100, frameStride: 4100 },
  1042: { frameBytes: 153600, frameStride: 153600 },
  1043: { frameBytes: 22880, frameStride: 22880 },
  1055: { frameBytes: 32768, frameStride: 32768 },
  1056: { frameBytes: 32768, frameStride: 32768 },
  1060: { frameBytes: 204800, frameStride: 204800 },
  1061: { frameBytes: 6160, frameStride: 6160 },
  1062: { frameBytes: 6272, frameStride: 6272 },
  1066: { frameBytes: 8192, frameStride: 8192 },
  1067: { frameBytes: 691200, frameStride: 691200 },
  1068: { frameBytes: 32768, frameStride: 32768 },
  1071: { frameBytes: 115200, frameStride: 115200 },
  1073: { frameBytes: 115200, frameStride: 115200 },
  1074: { frameBytes: 5000, frameStride: 5000 },
  1078: { frameBytes: 12800, frameStride: 12800 },
  1079: { frameBytes: 12800, frameStride: 12800 },
  1081: { frameBytes: 614400, frameStride: 614400 },
  1083: { frameBytes: 153600, frameStride: 153600 },
  1084: { frameBytes: 115200, frameStride: 115200 },
  1085: { frameBytes: 15488, frameStride: 15488 },
  1087: { frameBytes: 294912, frameStride: 294912 },
  1089: { frameBytes: 6728, frameStride: 6728 },
  1092: { frameBytes: 12800, frameStride: 12800 },
  1093: { frameBytes: 524288, frameStride: 524288 },
  2002: { frameBytes: 5000, frameStride: 5000 },
  2003: { frameBytes: 45000, frameStride: 45000 },
  3001: { frameBytes: 131072, frameStride: 131072 },
  3002: { frameBytes: 32768, frameStride: 32768 },
  3003: { frameBytes: 8192, frameStride: 8192 },
  3004: { frameBytes: 6160, frameStride: 8192 },
  3005: { frameBytes: 204800, frameStride: 204800 },
  3006: { frameBytes: 6272, frameStride: 8192 },
  3007: { frameBytes: 15488, frameStride: 16384 },
  3008: { frameBytes: 614400, frameStride: 614400 },
  3009: { frameBytes: 38400, frameStride: 40960 },
  3011: { frameBytes: 12640, frameStride: 12640 },
};
