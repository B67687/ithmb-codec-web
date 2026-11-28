import { PROFILES } from "./profiles.js";
import { DEFAULT_FORMAT } from "./utils.js";

// Known format prefixes from the codec's profile database (53 active profiles,
// generated into profiles.ts). Derived here so no second hand-maintained list
// can drift: profile 1044 is disabled upstream and is therefore NOT known.
export const KNOWN_PREFIXES = new Set<number>(Object.keys(PROFILES).map(Number));

// Consolidated scalar state
export const S = {
  cardCount: 0,
  globalCardIdCounter: 0,
  viewerIndex: -1,
  totalFiles: 0,
  downloadFormat: DEFAULT_FORMAT.mime,
  // Decodes accepted but not yet settled (download gating, progress label).
  pendingDecodes: 0,
  // ZIP build in progress (prevents double-click; enables the cancel label).
  buildingZip: false,
  zipCancel: false,
  zipDone: 0,
  zipTotal: 0,
  // Per-card format overrides: { cardId: "image/png", ... }
  cardFormats: {} as Record<string, string>,
  lastTarget: null as EventTarget | null,
};

// Mutable collections (kept as separate exports)
// Dedup of files by content fingerprint (ui.js) — one key per unique file.
export const processedFileIds = new Set<string>();
