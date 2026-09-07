// Unit tests for workers/telemetry/src/validation.ts — entry validation
import { describe, expect, it } from "bun:test";
import type { TelemetryBody } from "../../workers/telemetry/src/types";
import { validateEntry } from "../../workers/telemetry/src/validation";

function makeBody(overrides: Partial<TelemetryBody> = {}): TelemetryBody {
  return { prefix: 1067, status: "success", ...overrides };
}

describe("validateEntry", () => {
  it("passes a valid success entry through with defaults", () => {
    const entry = validateEntry(makeBody());
    expect(entry.prefix).toBe(1067);
    expect(entry.status).toBe("success");
    expect(entry.issue).toBeNull();
    expect(entry.issueDetail).toBeNull();
    expect(entry.width).toBeNull();
    expect(entry.height).toBeNull();
    expect(entry.header).toBeNull();
    expect(entry.fullFile).toBeNull();
    expect(entry.extension).toBeNull();
    expect(entry.hasFullFileInput).toBe(false);
  });

  it("defaults invalid status to 'success'", () => {
    const entry = validateEntry(makeBody({ status: "bogus" }));
    expect(entry.status).toBe("success");
  });

  it("accepts all valid statuses", () => {
    for (const status of ["success", "known-failed", "unknown", "looks-good", "looks-wrong"]) {
      const entry = validateEntry(makeBody({ status }));
      expect(entry.status).toBe(status);
    }
  });

  it("accepts valid known issues", () => {
    const entry = validateEntry(makeBody({ status: "looks-wrong", issue: "color_space" }));
    expect(entry.issue).toBe("color_space");
  });

  it("nullifies unknown issue types", () => {
    const entry = validateEntry(makeBody({ status: "looks-wrong", issue: "unknown_type" }));
    expect(entry.issue).toBeNull();
  });

  it("nullifies issues exceeding 40 chars", () => {
    const entry = validateEntry(makeBody({ status: "looks-wrong", issue: "a".repeat(41) }));
    expect(entry.issue).toBeNull();
  });

  it("accepts valid hex header", () => {
    const entry = validateEntry(makeBody({ header: "0a1b2c3d" }));
    expect(entry.header).toBe("0a1b2c3d");
  });

  it("nullifies non-hex header (XSS prevention)", () => {
    const entry = validateEntry(makeBody({ header: "<script>alert(1)</script>" }));
    expect(entry.header).toBeNull();
  });

  it("accepts valid width/height", () => {
    const entry = validateEntry(makeBody({ width: 720, height: 480 }));
    expect(entry.width).toBe(720);
    expect(entry.height).toBe(480);
  });

  it("nullifies zero/negative dimensions", () => {
    const entry = validateEntry(makeBody({ width: 0, height: -1 }));
    expect(entry.width).toBeNull();
    expect(entry.height).toBeNull();
  });

  it("accepts valid extension", () => {
    expect(validateEntry(makeBody({ extension: "ithmb" })).extension).toBe("ithmb");
    expect(validateEntry(makeBody({ extension: "ipm" })).extension).toBe("ipm");
  });

  it("nullifies invalid extension", () => {
    expect(validateEntry(makeBody({ extension: "jpg" })).extension).toBeNull();
  });

  it("accepts valid full_file on non-success status", () => {
    const entry = validateEntry(makeBody({ status: "known-failed", full_file: "SGVsbG8=" }));
    expect(entry.fullFile).toBe("SGVsbG8=");
  });

  it("nullifies full_file on success status", () => {
    const entry = validateEntry(makeBody({ status: "success", full_file: "SGVsbG8=" }));
    expect(entry.fullFile).toBeNull();
  });

  it("tracks hasFullFileInput even when full_file is rejected", () => {
    const entry = validateEntry(makeBody({ status: "success", full_file: "SGVsbG8=" }));
    expect(entry.hasFullFileInput).toBe(true);
    expect(entry.fullFile).toBeNull(); // rejected due to success status
  });
});
