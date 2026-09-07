// Unit tests for uniqueZipName (ithmb-decoder/download.ts filename policy)
import { describe, expect, it } from "vitest";
import { uniqueZipName } from "../../ithmb-decoder/download";

const taken = (...names: string[]): Record<string, Uint8Array> =>
  Object.fromEntries(names.map((n) => [n, new Uint8Array([0])]));

describe("uniqueZipName", () => {
  it("strips the .ithmb extension and appends target ext", () => {
    expect(uniqueZipName({}, "photo.ithmb", ".jpg")).toBe("photo.jpg");
  });

  it("strips path separators and leading dots (zip-slip guard)", () => {
    expect(uniqueZipName({}, "../evil.ithmb", ".png")).toBe("_evil.png");
  });

  it("strips leading dots", () => {
    expect(uniqueZipName({}, "...hidden.ithmb", ".jpg")).toBe("hidden.jpg");
  });

  it("falls back to decoded for empty stems", () => {
    expect(uniqueZipName({}, ".ithmb", ".jpg")).toBe("decoded.jpg");
  });

  it("suffixes duplicates so no file is overwritten", () => {
    expect(uniqueZipName(taken("photo.jpg"), "photo.ithmb", ".jpg")).toBe("photo-2.jpg");
  });

  it("chains suffixes past -2", () => {
    expect(uniqueZipName(taken("photo.jpg", "photo-2.jpg"), "photo.ithmb", ".jpg")).toBe(
      "photo-3.jpg",
    );
  });

  it("leaves non-colliding names untouched", () => {
    expect(uniqueZipName(taken("a.jpg"), "b.ithmb", ".jpg")).toBe("b.jpg");
  });

  it("suffixes extensionless collisions", () => {
    expect(uniqueZipName(taken("x"), "x.ithmb", "")).toBe("x-2");
  });
});
