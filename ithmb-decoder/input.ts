export function setupHoldRepeat(elementId: string, action: () => void): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  let timer: number | null = null;

  // Fire once immediately, then every 30ms while held (after a 400ms
  // grace period). Shared by the mouse and touch paths — the only
  // difference is which events cancel the repeat.
  const startRepeat = (cancelEvents: string[]): void => {
    action();
    const timeout = setTimeout(() => {
      timer = window.setInterval(action, 30);
    }, 400);
    const cancel = (): void => {
      clearTimeout(timeout);
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    for (const ev of cancelEvents) el.addEventListener(ev, cancel, { once: true });
  };

  el.addEventListener("mousedown", () => {
    startRepeat(["mouseup", "mouseleave"]);
  });

  el.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startRepeat(["touchend", "touchcancel"]);
  });

  // Native activation path: keyboard Enter/Space and programmatic .click()
  // produce a click with detail === 0. Pointer clicks (detail > 0) are already
  // handled by mousedown/touchstart above, so ignore them here to avoid
  // double-firing.
  el.addEventListener("click", (e) => {
    if (e.detail === 0) action();
  });
}
