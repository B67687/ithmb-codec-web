// decoder-boot.ts — authored TypeScript, bundled by scripts/build.mts into the
// classic script `decoder-boot.js` loaded from the decoder page <head> at
// navigation (CSP: external script only, no inline). The build inlines
// `decoder-copy.ts` and `locale.ts`, so the labels have one source and this
// file adds no extra request or deployed artifact.
//
// B6 purpose: get the WASM download started at navigation time and show real
// init progress, instead of a static "Preparing decoder…" that only appears
// after the whole ES-module graph has resolved.
//
// The <link rel="preload" as="fetch" type="application/wasm" crossorigin
// href="…wasm?v=…"> immediately above this script starts the HTTP request.
// This script then issues the same fetch (same URL, same CORS + credentials
// mode) so it attaches to the in-flight preload instead of downloading twice,
// and reads the body once to report byte progress. app.js compiles the bytes
// off the main thread (WebAssembly.compile) and instantiates from the module.
// (WebKit mis-instantiates a Response built from a teed ReadableStream, so the
// body is read here and compiled as bytes instead of streaming from JS streams.)
import { LOADING_COPY } from "./decoder-copy.js";
import { documentLocale } from "../ithmb-decoder/locale.js";

// Machine-readable init state, published from the first head script so tests
// (and support tooling) can poll `html[data-decoder-state]` instead of
// sleeping: "booting" -> "ready" (app.ts) | "failed" (watchdog/app.ts).
// The value is presentation-neutral: nothing in CSS keys off it.
document.documentElement.dataset.decoderState = "booting";

interface BootProgress {
  stage: string;
  loaded: number;
  total: number;
  pct: number;
}

type ProgressListener = (state: BootProgress) => void;

interface BootApi {
  load(): Promise<ArrayBuffer>;
  reset(): void;
  onProgress(fn: ProgressListener): () => void;
  progress: BootProgress;
  setStage(stage: string): void;
  ready(): void;
  hide(): void;
}

const link = document.querySelector("link[data-ithmb-wasm]") as HTMLLinkElement | null;
const href = link ? link.href : "";
const copy = () => LOADING_COPY[documentLocale() ?? "en"];
const label = (pct: number | null): string => copy().loading(pct);

// Fast local loads must never flash a loading label: the boot progress sits in
// the DOM from first paint but stays hidden for the first 2 s. The clock starts
// when this head script runs (navigation time), and ready() cancels the reveal.
// Long loads still get real byte progress.
const REVEAL_MS = 2000;
let navStart = performance.now();
let revealed = false;
let finished = false;
const listeners = new Set<ProgressListener>();
const state: BootProgress = { stage: "download", loaded: 0, total: 0, pct: 0 };

function emit(): void {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      // A broken listener must never stop init or other listeners.
    }
  }
}

function onProgress(fn: ProgressListener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

let decodingEl: HTMLElement | null = null;
function progressEl(): HTMLElement | null {
  if (!decodingEl) decodingEl = document.getElementById("decoding");
  return decodingEl;
}

// Real progress: one paint per changed percentage (the 4x-throttled CPU is
// busy compiling modules during the download).
let paintedPct = -1;
function preparingLabel(): string {
  return copy().preparing;
}
function render(): void {
  const el = progressEl();
  if (!el || finished) return;
  if (state.stage === "download") {
    if (state.pct === paintedPct) return;
    paintedPct = state.pct;
    el.textContent = "";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    el.append(spinner, " " + label(state.total > 0 ? state.pct : null));
  } else {
    el.textContent = "";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    el.append(spinner, " " + preparingLabel());
  }
}
function reveal(): void {
  if (revealed || finished) return;
  const el = progressEl();
  if (!el) {
    window.setTimeout(reveal, 100);
    return;
  }
  revealed = true;
  el.removeAttribute("hidden");
  render();
}
function paint(): void {
  render();
}
let revealTimer = 0;
function scheduleReveal(): void {
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(reveal, Math.max(0, REVEAL_MS - (performance.now() - navStart)));
}
scheduleReveal();

let inFlight: AbortController | null = null;
async function loadWasm(): Promise<ArrayBuffer> {
  if (!href) throw new Error("wasm preload link missing");
  inFlight = new AbortController();
  // mode + credentials must match the preload link's crossorigin="anonymous"
  // (the HTML attribute maps to CORS mode with same-origin credentials; a
  // plain fetch() defaults to "same-origin" credentials, but "omit" here
  // would make Chrome drop the preload and download the wasm twice).
  const resp = await fetch(href, { signal: inFlight.signal });
  if (!resp.ok) throw new Error("wasm fetch failed: HTTP " + resp.status);
  state.total = Number(resp.headers.get("content-length")) || 0;
  if (!resp.body || typeof resp.body.getReader !== "function") {
    const buf = await resp.arrayBuffer();
    state.loaded = buf.byteLength;
    state.total = state.total || buf.byteLength;
    state.pct = 100;
    emit();
    paint();
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    state.loaded = loaded;
    if (state.total > 0) state.pct = Math.min(99, Math.round((loaded / state.total) * 100));
    emit();
    paint();
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  state.pct = 100;
  emit();
  paint();
  return out.buffer;
}

let attempt: Promise<ArrayBuffer> | null = null;
// Retryable: a rejected attempt is cleared so the failure panel's Retry can
// start a fresh download (the browser HTTP cache usually still has it).
function load(): Promise<ArrayBuffer> {
  if (!attempt) {
    finished = false;
    revealed = false;
    navStart = performance.now();
    scheduleReveal();
    state.stage = "download";
    state.loaded = 0;
    state.pct = 0;
    paintedPct = -1;
    attempt = loadWasm();
    attempt.catch(() => {
      attempt = null;
    });
  }
  return attempt;
}

// Surfaced for app.js: await the bytes, subscribe to progress, and take the
// loading label over once the download is done.
(window as unknown as { __ithmbBoot: BootApi }).__ithmbBoot = {
  load,
  /** Abort a hung attempt and clear the cache so the next load is fresh. */
  reset(): void {
    try {
      inFlight?.abort();
    } catch {
      /* already settled */
    }
    inFlight = null;
    attempt = null;
  },
  onProgress,
  progress: state,
  setStage(stage: string): void {
    state.stage = stage;
    paint();
    emit();
  },
  ready(): void {
    finished = true;
    const el = progressEl();
    if (el) el.setAttribute("hidden", "");
  },
  /** Failure/cancel: stop and hide progress; the failure panel takes over. */
  hide(): void {
    finished = true;
    const el = progressEl();
    if (el) el.setAttribute("hidden", "");
  },
};

// Start the download at navigation. app.js awaits the same promise later;
// a rejected first attempt is retried by the failure panel's Retry handler.
load().catch(() => {
  /* surfaced by app.js / the watchdog panel */
});

// Show the early loading state as soon as the body element exists: do not
// wait for DOMContentLoaded (parser-blocking chrome scripts would delay it).
function paintWhenReady(): void {
  if (progressEl()) {
    paint();
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
    window.setTimeout(paintWhenReady, 100);
  }
}
paintWhenReady();
