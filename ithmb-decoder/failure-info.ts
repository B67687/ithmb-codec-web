import { documentLocale, pagePath, t } from "./i18n.js";
import { KNOWN_PREFIXES } from "./state.js";
import { escapeHtml, formatSize } from "./utils.js";

// How a decode failure should be described. A file we could not read because
// it is empty/truncated/corrupt is "damaged"; a file whose header is simply
// not a recognised ithmb variant is "unknown".
export type FailureMode = "damaged" | "unknown" | "database";

export function failureMode(bytes: Uint8Array, prefix: number): FailureMode {
  if (bytes.length < 16) return "damaged";
  return KNOWN_PREFIXES.has(prefix) ? "damaged" : "unknown";
}

export interface FailureInfoParams {
  cardId: string;
  bytes: Uint8Array;
  prefix: number;
  fileSize: number;
  mode?: FailureMode;
}

// The failure state without the old contribute workflow: why the file could
// not be decoded plus useful next steps (GitHub issues, guide, privacy, try
// another file). Used by the result card ("card" layout) and the viewer band
// ("band" layout) so both surfaces stay identical across language switches.
export function createFailureInfo(
  { cardId, bytes, prefix, fileSize, mode = "damaged" }: FailureInfoParams,
  layout: "band" | "card" = "band",
): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "failure-info failure-info--" + layout;
  box.dataset.card = cardId;

  const isEmpty = bytes.length === 0;
  const why =
    mode === "database"
      ? t("failure.whyDatabase")
      : isEmpty
        ? t("failure.whyEmpty")
        : mode === "damaged"
          ? t("failure.whyDamaged")
          : t("failure.whyUnknown");
  const title =
    mode === "database"
      ? t("failure.databaseTitle")
      : mode === "damaged"
        ? t("failure.damagedTitle")
        : t("failure.unknownTitle");
  const meta = t("failure.meta", { prefix, size: formatSize(fileSize) });

  // Page hrefs are asked for by registry key, never hand-written: the guide and
  // privacy URLs in this failure panel cannot drift from the route table.
  const lang = documentLocale() === "zh" ? "zh" : "en";
  const guideHref = pagePath("guide", lang);
  const privacyHref = pagePath("privacy", lang);
  const issues = "https://github.com/B67687/Ithmb-Codec/issues";

  const head =
    layout === "band"
      ? `<div class="failure-info__head">
        <h4 class="failure-info__title">${escapeHtml(title)}</h4>
      </div>
      <p class="failure-info__meta">${escapeHtml(meta)}</p>`
      : "";

  box.innerHTML = `
    ${head}
    <p class="failure-info__why">${escapeHtml(why)}</p>
    <p class="failure-info__links">
      <a href="${issues}" target="_blank" rel="noopener noreferrer">${t("failure.reportIssue")}<span class="sr-only">${t("a11y.opensNewTab")}</span></a>
      <span aria-hidden="true">·</span>
      <a href="${guideHref}" target="_blank" rel="noopener noreferrer">${t("failure.nextGuide")}<span class="sr-only">${t("a11y.opensNewTab")}</span></a>
      <span aria-hidden="true">·</span>
      <a href="${privacyHref}" target="_blank" rel="noopener noreferrer">${t("failure.nextPrivacy")}<span class="sr-only">${t("a11y.opensNewTab")}</span></a>
      <span aria-hidden="true">·</span>
      <button type="button" class="failure-info__try" data-open-picker>${t("failure.nextTry")}</button>
    </p>`;

  return box;
}
