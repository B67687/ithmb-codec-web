import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only discover tests in tests/unit/ — exclude Playwright specs, _site/, workers/
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["node_modules/**", "_site/**", "tests/**/*.spec.ts"],
  },
});
