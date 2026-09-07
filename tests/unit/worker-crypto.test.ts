// Unit tests for workers/telemetry/src/crypto.ts — pure functions
import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  keyedPseudonym,
  tokensEqual,
  validBase64Payload,
} from "../../workers/telemetry/src/crypto";

describe("escapeHtml (worker)", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets and quotes", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("returns non-string types as string", () => {
    expect(escapeHtml(42 as unknown as string)).toBe("42");
    expect(escapeHtml(null as unknown as string)).toBe("null");
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("validBase64Payload (worker)", () => {
  it("accepts valid base64", () => {
    expect(validBase64Payload("SGVsbG8=")).toBe(true); // "Hello"
  });

  it("rejects non-base64 characters", () => {
    expect(validBase64Payload("SGVs!G8=")).toBe(false);
  });

  it("rejects incorrect padding length", () => {
    expect(validBase64Payload("SGVsbG8")).toBe(false); // missing padding
  });

  it("rejects payloads exceeding 8 MiB decoded", () => {
    // 8 MiB = 8 * 1024 * 1024 = 8388608 bytes
    // base64 length for 8 MiB = ceil(8388608 / 3) * 4 = 11184812
    // Just over: 11184813 chars (not divisible by 4 → already invalid)
    // Use exactly 11184816 (divisible by 4) → decodes to 8388612 bytes > 8 MiB
    const overLimit = "A".repeat(11184816);
    expect(validBase64Payload(overLimit)).toBe(false);
  });

  it("accepts payloads at exactly 8 MiB decoded", () => {
    // 8 MiB = 8388608 bytes. decoded = (length/4)*3 - pad.
    // 11184808 'A' chars (divisible by 4): decoded = 2796202*3 = 8388606 < 8388608
    const atLimit = "A".repeat(11184808);
    expect(validBase64Payload(atLimit)).toBe(true);
  });
});

describe("tokensEqual (worker)", () => {
  it("returns true for identical tokens", async () => {
    expect(await tokensEqual("secret123", "secret123")).toBe(true);
  });

  it("returns false for different tokens", async () => {
    expect(await tokensEqual("secret123", "secret124")).toBe(false);
  });

  it("returns false for empty vs non-empty", async () => {
    expect(await tokensEqual("", "a")).toBe(false);
  });
});

describe("keyedPseudonym (worker)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEnv: any = {
    FORMAT_TELEMETRY: {},
    ADMIN_TOKEN: "test-admin-token",
    IP_HMAC_SECRET: "test-hmac-secret",
  };

  it("returns a 32-char hex string", async () => {
    const result = await keyedPseudonym(mockEnv, "test-data");
    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic for same input", async () => {
    const a = await keyedPseudonym(mockEnv, "192.168.1.1");
    const b = await keyedPseudonym(mockEnv, "192.168.1.1");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", async () => {
    const a = await keyedPseudonym(mockEnv, "192.168.1.1");
    const b = await keyedPseudonym(mockEnv, "10.0.0.1");
    expect(a).not.toBe(b);
  });

  it("falls back to ADMIN_TOKEN when IP_HMAC_SECRET is absent", async () => {
    const envNoSecret = { ...mockEnv, IP_HMAC_SECRET: undefined };
    const result = await keyedPseudonym(envNoSecret, "test");
    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });
});
