// modal.ts — one small modal controller shared by the nav confirm dialog and
// the guide lightbox.
//
// The callers keep their own markup, ids, classes, copy and show/hide visuals;
// this module owns the behaviour every modal in the site needs:
//   - Tab / Shift+Tab focus trap inside the dialog
//   - Escape and background (scrim) click dismissal
//   - focus return to the opener (with a caller-supplied fallback)
//   - background `inert` isolation, composable through named reasons so a
//     drawer can sit behind a dialog and each surface releases only its own.
//
// No native <dialog> element: both surfaces are positioned overlays styled by
// their existing CSS (.modal-overlay / .guide-lightbox). <dialog> would move
// them into the top layer with a ::backdrop and change stacking + visuals, so
// the controller deliberately keeps the current elements.

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Landmarks that carry the page behind every modal surface. */
const BACKGROUND = ".skip-link, nav.top-nav, main, footer";

/** The current site background elements (queried again on every sync). */
export function siteBackground(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(BACKGROUND)];
}

export interface BackgroundInert {
  /** Inert the background while `reason` is held; optional per-reason scope. */
  hold(reason: string, applies?: (el: HTMLElement) => boolean): void;
  /** Stop holding `reason` and restore only the elements nobody else holds. */
  release(reason: string): void;
}

/**
 * Background isolation with named, composable reasons. The union of every held
 * reason decides which elements are inert, so the mobile drawer (which keeps
 * the nav itself active) can stay open behind the confirm dialog (which inerts
 * the whole page) and closing one surface never clears the other.
 */
export function createBackgroundInert(targets: () => Iterable<HTMLElement>): BackgroundInert {
  const holds = new Map<string, (el: HTMLElement) => boolean>();
  const inerted = new Set<HTMLElement>();
  const sync = (): void => {
    for (const el of targets()) {
      const shouldInert = [...holds.values()].some((applies) => applies(el));
      if (shouldInert) {
        if (!el.inert) el.inert = true;
        inerted.add(el);
      } else if (inerted.delete(el)) {
        el.inert = false;
      }
    }
  };
  return {
    hold(reason: string, applies: (el: HTMLElement) => boolean = () => true): void {
      holds.set(reason, applies);
      sync();
    },
    release(reason: string): void {
      if (holds.delete(reason)) sync();
    },
  };
}

function visible(el: Element | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    document.contains(el) &&
    el.offsetParent !== null &&
    !el.closest("[hidden]")
  );
}

export interface ModalOptions {
  /** Full-viewport element; a click on it (not on its content) dismisses. */
  overlay: HTMLElement;
  /** Focus scope: Tab and Shift+Tab cycle inside this element. */
  dialog: HTMLElement;
  /** Escape and scrim clicks request this; the caller hides and calls close(). */
  onDismiss: () => void;
  /** Focus target on open; defaults to the dialog element itself. */
  initialFocus?: () => HTMLElement | null;
  /** Background isolation manager this modal holds while open. */
  inert: BackgroundInert;
  /** Reason key held against the inert manager. */
  inertReason: string;
  /** Fallback focus target when the opener is hidden or gone. */
  fallbackFocus?: () => HTMLElement | null;
}

export interface Modal {
  /** Capture the opener, isolate the background, trap input and focus inside. */
  open(opener?: HTMLElement | null): void;
  /** Release everything and return focus to the opener (or fallback). */
  close(): void;
  isOpen(): boolean;
}

export function createModal(options: ModalOptions): Modal {
  const { overlay, dialog } = options;
  let open = false;
  let returnFocus: HTMLElement | null = null;

  const focusables = (): HTMLElement[] =>
    [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open) return;
    if (event.key === "Escape") {
      // Stop here: the dialog sits on top of the drawer, whose own Escape
      // handler must not also close it.
      event.preventDefault();
      event.stopPropagation();
      options.onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const current = document.activeElement;
    if (!items.includes(current as HTMLElement)) {
      // Initial focus usually sits on the dialog/title: Shift+Tab still wraps
      // backwards to the last control, matching a browser-native trap.
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onOverlayClick = (event: MouseEvent): void => {
    if (open && event.target === overlay) options.onDismiss();
  };

  const detach = (): void => {
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.removeEventListener("click", onOverlayClick);
  };

  return {
    open(opener: HTMLElement | null = null): void {
      if (open) return;
      open = true;
      returnFocus = opener ?? (document.activeElement as HTMLElement | null);
      options.inert.hold(options.inertReason);
      document.addEventListener("keydown", onKeyDown, true);
      overlay.addEventListener("click", onOverlayClick);
      (options.initialFocus?.() ?? dialog).focus();
    },
    close(): void {
      if (!open) return;
      open = false;
      detach();
      options.inert.release(options.inertReason);
      const fallback = options.fallbackFocus?.() ?? null;
      const target = visible(returnFocus) ? returnFocus : visible(fallback) ? fallback : null;
      returnFocus = null;
      target?.focus();
    },
    isOpen(): boolean {
      return open;
    },
  };
}
