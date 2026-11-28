/**
 * decoder-copy.ts — the single source of copy for the decoder's classic boot
 * scripts, which cannot `import` an ES module at runtime.
 *
 * `decoder-boot.ts` renders the loading labels and `decoder-watchdog.ts`
 * renders the failure panel; both are bundled IIFE scripts (the build inlines
 * this module into each), so the English and Chinese strings live here once
 * instead of being hand-copied into the two files.
 *
 * Only the locale-independent copy lives here. Strings that the running app
 * already renders through the locale tables (`locales/*.json` → `t()`) stay in
 * those tables: app.ts's "check your connection" failure body is a different,
 * context-specific message from the watchdog's blocked-module fallback.
 */
import type { Locale } from "../ithmb-decoder/locale.js";

export interface LoadingCopy {
  /** Download label; `pct` is null while the total byte count is unknown. */
  loading(pct: number | null): string;
  /** Shown once the bytes are downloaded and the module is compiling. */
  preparing: string;
}

export interface FailureCopy {
  title: string;
  /** Fallback body used for the fast module-graph watchdog path. */
  body: string;
  retry: string;
  retrying: string;
}

export const LOADING_COPY: Record<Locale, LoadingCopy> = {
  en: {
    loading: (pct) => (pct === null ? "Loading decoder…" : `Loading decoder… ${pct}%`),
    preparing: "Preparing decoder…",
  },
  zh: {
    loading: (pct) => (pct === null ? "正在载入解码器…" : `正在载入解码器…${pct}%`),
    preparing: "正在准备解码器…",
  },
};

export const FAILURE_COPY: Record<Locale, FailureCopy> = {
  en: {
    title: "The decoder didn't load",
    body: "The script may have been blocked or the network dropped. Retry when the connection is back.",
    retry: "Retry",
    retrying: "Retrying…",
  },
  zh: {
    title: "解码器没加载出来",
    body: "脚本可能被拦了，或者网络断了。检查一下再点“重试”，或者刷新页面。",
    retry: "重试",
    retrying: "正在重试…",
  },
};
