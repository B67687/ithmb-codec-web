// Shared E2E polling helpers.
//
// The app publishes machine-readable state so tests can wait on facts instead
// of wall-clock sleeps:
//   html[data-decoder-state]   booting | ready | failed  (decoder init)
//   body[data-decode-phase]    idle | decoding | settled  (results pipeline)
//   body[data-decoded-count]   successfully decoded images
//   body[data-file-count]      accepted containers in the session
//   body[data-viewer-state]    closed | loading | image | failed
// See ithmb-decoder/app.ts, viewer.ts, decoder-boot.ts and decoder-watchdog.ts.
import { type Download, expect, type Page } from "@playwright/test";

/** Wait until the decoder module/WASM init has finished or failed. */
export function waitDecoderInit(page: Page): Promise<void> {
  return page
    .waitForSelector('html[data-decoder-state="ready"]', { timeout: 40000 })
    .then(() => undefined);
}

/** Wait until decoder init reached the given state. */
export async function waitDecoderState(page: Page, state: "booting" | "ready" | "failed") {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.decoderState ?? null), {
      timeout: 40000,
    })
    .toBe(state);
}

/**
 * Wait until every accepted decode has settled (no `.status.loading` left) and
 * the results pipeline reports `settled`. `minFiles` is a lower bound because
 * batches accumulate across Add-file calls; `timeout` defaults high enough for
 * 3-browser runs under parallel load.
 */
export async function waitDecodeSettled(page: Page, minFiles = 1, timeout = 90000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((min) => {
          const cards = document.querySelectorAll(".file-card").length;
          const loading = document.querySelectorAll(".file-card .status.loading").length;
          return (
            document.body.dataset.decodePhase === "settled" &&
            cards >= min &&
            Number(document.body.dataset.fileCount ?? -1) >= min &&
            loading === 0
          );
        }, minFiles),
      { timeout },
    )
    .toBe(true);
}

/** Reasons the decoder's persistent batch summary reports (see ui.ts BatchSkips). */
export type BatchSkipReason =
  | "unsupported"
  | "tooLarge"
  | "duplicates"
  | "fileCap"
  | "byteCap"
  | "folders";

/**
 * Wait until the persistent batch summary reports at least `count` files
 * skipped for `reason`. This is the observable end of a batch that legitimately
 * adds no cards (a duplicate re-drop), where waiting for a file-count increase
 * would hang and a fixed sleep would hide the race.
 */
export async function waitForBatchSkip(
  page: Page,
  reason: BatchSkipReason,
  count = 1,
  timeout = 30000,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          ([r, min]) => {
            const raw = document.getElementById("batchNotice")?.dataset.reasons;
            if (!raw) return false;
            try {
              return (
                Number((JSON.parse(raw) as Record<string, number>)[r as string] ?? 0) >=
                (min as number)
              );
            } catch {
              return false;
            }
          },
          [reason, count] as const,
        ),
      { timeout },
    )
    .toBe(true);
}

/**
 * Poll a value inside the page until two consecutive samples are equal, then
 * return it. Use before measuring geometry that settles over a frame or two
 * (stage/canvas size) instead of sleeping a guessed number of milliseconds.
 */
export async function waitForStableValue<T>(read: () => Promise<T>, timeout = 8000): Promise<T> {
  let previous: T | undefined;
  let stable: T | undefined;
  await expect
    .poll(
      async () => {
        const value = await read();
        if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(value)) {
          stable = value;
          return true;
        }
        previous = value;
        return false;
      },
      { timeout, intervals: [100, 150, 200] },
    )
    .toBe(true);
  return stable as T;
}

/**
 * Sample whether `selector` is visible on every animation frame for `ms`,
 * inside the page. Use instead of a blind sleep followed by one assertion when
 * the property under test is "stays visible for the duration of a transition".
 */
export function sampleVisibility(page: Page, selector: string, ms: number): Promise<boolean[]> {
  return page.evaluate(
    async ([sel, duration]) => {
      const isVisible = (): boolean => {
        const el = document.querySelector(sel as string) as HTMLElement | null;
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(el).visibility !== "hidden" &&
          getComputedStyle(el).display !== "none"
        );
      };
      const out: boolean[] = [];
      const end = performance.now() + (duration as number);
      while (performance.now() < end) {
        out.push(isVisible());
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return out;
    },
    [selector, ms] as const,
  );
}

/**
 * Run `trigger` and resolve with the download it starts. Replaces "click then
 * sleep" around ZIP/save exports: the download event is the state to poll.
 */
export async function waitForDownload(
  page: Page,
  trigger: () => Promise<void>,
  timeout = 30000,
): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout }), trigger()]);
  return download;
}

/** Wait for the viewer stage to reach a state: loading | image | failed. */
export async function waitViewerState(page: Page, state: "loading" | "image" | "failed") {
  await expect
    .poll(() => page.evaluate(() => document.body.dataset.viewerState ?? null), { timeout: 30000 })
    .toBe(state);
}

/** Number of successfully decoded images, as published by the app. */
export function decodedCount(page: Page): Promise<number> {
  return page.evaluate(() => Number(document.body.dataset.decodedCount ?? -1));
}

/**
 * Sample an attribute of (at most one) element every 25 ms for `ms`, inside the
 * page. Use this instead of a blind sleep followed by one assertion when the
 * property under test is "stays x for the duration of an animation".
 */
export function sampleAttribute(page: Page, selector: string, attribute: string, ms: number) {
  return page.evaluate(
    async ([sel, attr, duration]) => {
      const out: (string | null)[] = [];
      const end = performance.now() + (duration as number);
      while (performance.now() < end) {
        out.push(
          (document.querySelector(sel as string) as HTMLElement | null)?.getAttribute(
            attr as string,
          ) ?? null,
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return out;
    },
    [selector, attribute, ms] as const,
  );
}

/** Wait until two consecutive frames report the same scroll offset. */
export async function waitForScrollEnd(page: Page, timeout = 8000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const before = window.scrollY;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return Math.abs(window.scrollY - before) < 1;
        }),
      { timeout },
    )
    .toBe(true);
}
