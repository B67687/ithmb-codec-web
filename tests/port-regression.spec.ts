import { expect, test } from "@playwright/test";
import { ACT_PORTS, resolveWebPort } from "../playwright.config";

// REVIEW 5.1 regression defense: the act (nektos) port-collision fix (VALIDATION
// learning #1/#2) must never silently regress. Under act, each matrix browser job
// binds a DEDICATED port (chromium 8999 / firefox 8998 / webkit 8997) so the
// parallel jobs on the shared host network cannot collide with each other or with
// the local-dev preview server on :8899. If anyone ever collapses these back to a
// single shared port (or back onto 8899), this suite fails in real CI.
test.describe("act port assignment regression guard", () => {
  test("each browser gets a distinct act port", () => {
    const ports = Object.values(ACT_PORTS);
    expect(new Set(ports).size).toBe(ports.length);
  });

  test("no act port collides with the local-dev preview port 8899", () => {
    for (const port of Object.values(ACT_PORTS)) {
      expect(port).not.toBe(8899);
    }
  });

  test("all act ports fall in the reserved range", () => {
    for (const port of Object.values(ACT_PORTS)) {
      expect(port).toBeGreaterThanOrEqual(8990);
      expect(port).toBeLessThan(9000);
    }
  });

  test("act resolution maps each browser to its dedicated port", () => {
    expect(resolveWebPort(true, "chromium")).toBe(8999);
    expect(resolveWebPort(true, "firefox")).toBe(8998);
    expect(resolveWebPort(true, "webkit")).toBe(8997);
  });

  test("unknown browser under act falls back to the chromium port", () => {
    expect(resolveWebPort(true, undefined)).toBe(8999);
    expect(resolveWebPort(true, "edge")).toBe(8999);
  });

  test("non-act (local dev and real CI) keeps the 8899 reuse flow", () => {
    expect(resolveWebPort(false, "chromium")).toBe(8899);
    expect(resolveWebPort(false, undefined)).toBe(8899);
  });
});
