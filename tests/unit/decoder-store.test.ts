// Unit tests for ithmb-decoder/cards.ts (pure store, no DOM)
import { beforeEach, describe, expect, it } from "bun:test";
import {
  addFailure,
  addSuccess,
  failedCards,
  findFailure,
  findSuccess,
  resetCards,
  successCards,
  successCount,
} from "../../ithmb-decoder/cards";
import type { FailureEntry, SuccessEntry } from "../../ithmb-decoder/cards";

const success = (cardId: string): SuccessEntry => ({
  cardId,
  canvas: {} as HTMLCanvasElement,
  fileName: `${cardId}.ithmb`,
  bytes: new Uint8Array([1, 2, 3]),
  prefix: 1067,
  fileSize: 3,
  width: 1,
  height: 1,
});
const failure = (cardId: string): FailureEntry => ({
  cardId,
  bytes: new Uint8Array([9]),
  prefix: 9999,
  fileName: `${cardId}.ithmb`,
  fileSize: 1,
});

beforeEach(() => resetCards());

describe("addSuccess / successCount", () => {
  it("counts successes", () => {
    addSuccess(success("a"));
    addSuccess(success("b"));
    expect(successCount()).toBe(2);
  });

  it("starts empty after reset", () => {
    addSuccess(success("a"));
    resetCards();
    expect(successCount()).toBe(0);
  });
});

describe("addFailure / failedCards", () => {
  it("stores failures separately from successes", () => {
    addSuccess(success("a"));
    addFailure(failure("b"));
    expect(successCount()).toBe(1);
    expect(failedCards()).toHaveLength(1);
  });

  it("resetCards clears both lists together", () => {
    addSuccess(success("a"));
    addFailure(failure("b"));
    resetCards();
    expect(successCards()).toEqual([]);
    expect(failedCards()).toEqual([]);
  });
});

describe("copy semantics", () => {
  it("successCards returns a copy", () => {
    addSuccess(success("a"));
    const c = successCards();
    c.pop();
    expect(successCount()).toBe(1);
  });

  it("failedCards returns a copy", () => {
    addFailure(failure("a"));
    const c = failedCards();
    c.length = 0;
    expect(failedCards()).toHaveLength(1);
  });
});

describe("find", () => {
  it("findSuccess locates by cardId", () => {
    addSuccess(success("a"));
    expect(findSuccess("a")?.fileName).toBe("a.ithmb");
    expect(findSuccess("zz")).toBeUndefined();
  });

  it("findFailure locates by cardId", () => {
    addFailure(failure("b"));
    expect(findFailure("b")?.prefix).toBe(9999);
    expect(findFailure("zz")).toBeUndefined();
  });
});
