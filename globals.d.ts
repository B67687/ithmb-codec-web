// globals.d.ts — precise types for the legacy global boundaries that the
// migration cannot remove without changing runtime behavior. NO `any` here:
// every global is declared with an exact shape.

// i18n.js (an ES module) publishes window hooks so classic scripts that cannot
// `import` (nav.js, footer.js) can still read translations. footer.js polls for
// window.t, so it is intentionally optional.
interface Window {
  t?: (key: string, params?: Record<string, string | number>) => string;
  setLang?: (lang: string) => void;
  IthmbTheme?: {
    get(): string;
    set(theme: string): void;
    toggle(): void;
  };
  I18N?: {
    lang: string;
    strings: Record<string, string>;
    loaded: boolean;
  };
}
