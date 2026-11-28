// globals.d.ts — precise types for the legacy global boundaries that the
// migration cannot remove without changing runtime behavior. NO `any` here:
// every global is declared with an exact shape.

// nav.js owns the accessible confirm dialog; this is the one typed declaration
// of its contract. The decoder reaches it through the confirm() wrapper in
// utils.ts (no second hand-written `IthmbConfirm` type anywhere).
interface IthmbConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
}

interface Window {
  // i18n.js (an ES module) publishes window hooks so classic scripts that cannot
  // `import` (nav.js, footer.js) can still read translations. footer.js polls
  // for window.t, so it is intentionally optional.
  t?: (key: string, params?: Record<string, string | number>) => string;
  setLang?: (lang: string) => void;
  IthmbConfirm?: (options: IthmbConfirmOptions) => Promise<boolean>;
  /** Set once a confirmed destructive action may leave the page (beforeunload guard). */
  IthmbAllowUnload?: boolean;
  IthmbTheme?: {
    get(): string;
    set(theme: string): void;
    toggle(): void;
    /** Subscribe to every theme change applied by the theme owner. */
    subscribe(fn: (theme: string) => void): () => void;
  };
  I18N?: {
    lang: string;
    strings: Record<string, string>;
    loaded: boolean;
  };
}
