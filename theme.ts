(() => {
  // Theme: applies data-theme="light|dark" to <html> before first paint so
  // there is no flash of the wrong theme. Resolution order:
  //   1. explicit choice saved in localStorage (ithmbTheme)
  //   2. otherwise the OS/browser preference (prefers-color-scheme)
  // The nav's theme toggle writes an explicit choice; the system is followed
  // live only while no explicit choice exists.
  const STORAGE_KEY = "ithmbTheme";
  const root = document.documentElement;

  function detect(): string {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // storage blocked — fall through to system preference
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function apply(theme: string): void {
    root.dataset.theme = theme;
  }

  apply(detect());

  // Follow the system live while the user has no explicit choice.
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = (e: MediaQueryListEvent): void => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", onChange);
    }
  } catch {
    // storage blocked — system preference only
  }

  // Exposed for the nav toggle button.
  window.IthmbTheme = {
    get(): string {
      return root.dataset.theme === "dark" ? "dark" : "light";
    },
    set(theme: string): void {
      apply(theme);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // storage blocked — theme applies for this page only
      }
    },
    toggle(): void {
      this.set(this.get() === "dark" ? "light" : "dark");
    },
  };
})();
