((): void => {
  // Theme: applies data-theme="light|dark" to <html> before first paint so
  // there is no flash of the wrong theme. Resolution order:
  //   1. explicit choice saved in localStorage (ithmbTheme)
  //   2. otherwise the OS/browser preference (prefers-color-scheme)
  // The nav's theme toggle writes an explicit choice; the system is followed
  // live only while no explicit choice exists.
  //
  // `window.IthmbTheme` is the ONLY owner of theme state: the media query is
  // created and listened to here once, and consumers subscribe instead of
  // re-reading `data-theme` or adding their own matchMedia listeners.
  const STORAGE_KEY = "ithmbTheme";
  const root = document.documentElement;
  type Theme = "light" | "dark";
  type ThemeListener = (theme: Theme) => void;

  const listeners = new Set<ThemeListener>();
  const systemQuery: MediaQueryList | null =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  let systemListener: ((e: MediaQueryListEvent) => void) | null = null;

  function readStored(): Theme | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "light" || saved === "dark" ? saved : null;
    } catch {
      // storage blocked: no explicit choice is available
      return null;
    }
  }

  function systemTheme(): Theme {
    return systemQuery?.matches ? "dark" : "light";
  }

  function apply(theme: Theme): void {
    root.dataset.theme = theme;
    for (const fn of listeners) {
      try {
        fn(theme);
      } catch {
        // A broken subscriber must never block the theme update.
      }
    }
  }

  function followSystem(): void {
    if (!systemQuery || systemListener) return;
    systemListener = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
    systemQuery.addEventListener("change", systemListener);
  }

  function stopFollowingSystem(): void {
    if (!systemQuery || !systemListener) return;
    systemQuery.removeEventListener("change", systemListener);
    systemListener = null;
  }

  // One state read at boot: a stored choice is pinned, no choice follows the
  // OS live. A storage exception means "no stored choice", so the OS is still
  // followed (storage-blocked must behave like a first visit).
  const stored = readStored();
  apply(stored ?? systemTheme());
  if (!stored) followSystem();

  interface ThemeApi {
    get(): Theme;
    set(theme: Theme): void;
    toggle(): void;
    /** Subscribe to every applied theme change; returns an unsubscribe fn. */
    subscribe(fn: ThemeListener): () => void;
  }

  const api: ThemeApi = {
    get(): Theme {
      return root.dataset.theme === "dark" ? "dark" : "light";
    },
    set(theme: Theme): void {
      apply(theme);
      // An explicit choice is pinned: later OS changes must not override it.
      stopFollowingSystem();
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // storage blocked — theme applies for this page only
      }
    },
    toggle(): void {
      api.set(api.get() === "dark" ? "light" : "dark");
    },
    subscribe(fn: ThemeListener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  (window as unknown as { IthmbTheme: ThemeApi }).IthmbTheme = api;
})();
