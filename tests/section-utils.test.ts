import { describe, it, expect } from "vitest";
import { splitLiturgyBlock } from "../lib/section-utils";
import type { LiturgyBlock } from "../lib/service-plan";

function makeBlock(overrides?: Partial<LiturgyBlock>): LiturgyBlock {
  return {
    kind: "liturgy",
    title: "Salutation and Collect of the Day",
    citation: "LSB 158",
    includeInSlides: true,
    items: [
      { kind: "spoken", speaker: "P", text: "The Lord be with you." },
      { kind: "spoken", speaker: "C", text: "And also with you." },
      { kind: "spoken", speaker: "P", text: "Let us pray..." },
      { kind: "spoken", speaker: "C", text: "Amen." },
    ],
    ...overrides,
  };
}

describe("splitLiturgyBlock — happy path", () => {
  it("splits a 4-item block at index 2 into two 2-item blocks", () => {
    const block = makeBlock();
    const [first, second] = splitLiturgyBlock(block, 2);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
  });

  it("first half contains items[0] and items[1]", () => {
    const block = makeBlock();
    const [first] = splitLiturgyBlock(block, 2);
    expect(first.items[0]).toEqual(block.items[0]);
    expect(first.items[1]).toEqual(block.items[1]);
  });

  it("second half contains items[2] and items[3]", () => {
    const block = makeBlock();
    const [, second] = splitLiturgyBlock(block, 2);
    expect(second.items[0]).toEqual(block.items[2]);
    expect(second.items[1]).toEqual(block.items[3]);
  });
});

describe("splitLiturgyBlock — field propagation", () => {
  it("first half preserves title, citation, and includeInSlides", () => {
    const block = makeBlock();
    const [first] = splitLiturgyBlock(block, 2);
    expect(first.title).toBe("Salutation and Collect of the Day");
    expect(first.citation).toBe("LSB 158");
    expect(first.includeInSlides).toBe(true);
  });

  it("second half has empty title and no citation", () => {
    const block = makeBlock();
    const [, second] = splitLiturgyBlock(block, 2);
    expect(second.title).toBe("");
    expect(second.citation).toBeUndefined();
  });

  it("second half inherits includeInSlides from source", () => {
    const block = makeBlock({ includeInSlides: false });
    const [, second] = splitLiturgyBlock(block, 2);
    expect(second.includeInSlides).toBe(false);
  });

  it("second half inherits includeInSlides when undefined", () => {
    const block = makeBlock({ includeInSlides: undefined });
    const [, second] = splitLiturgyBlock(block, 2);
    expect(second.includeInSlides).toBeUndefined();
  });
});

describe("splitLiturgyBlock — error cases", () => {
  it("throws when itemIndex is 0", () => {
    const block = makeBlock();
    expect(() => splitLiturgyBlock(block, 0)).toThrow("split index out of range");
  });

  it("throws when itemIndex is negative", () => {
    const block = makeBlock();
    expect(() => splitLiturgyBlock(block, -1)).toThrow("split index out of range");
  });

  it("throws when itemIndex equals items.length", () => {
    const block = makeBlock();
    expect(() => splitLiturgyBlock(block, block.items.length)).toThrow(
      "split index out of range",
    );
  });

  it("throws when itemIndex exceeds items.length", () => {
    const block = makeBlock();
    expect(() => splitLiturgyBlock(block, block.items.length + 1)).toThrow(
      "split index out of range",
    );
  });
});

describe("splitLiturgyBlock — immutability", () => {
  it("does not mutate the original block's items array", () => {
    const block = makeBlock();
    const originalItems = block.items;
    splitLiturgyBlock(block, 2);
    expect(block.items).toBe(originalItems);
    expect(block.items).toHaveLength(4);
  });

  it("returned halves have distinct items arrays from each other and the source", () => {
    const block = makeBlock();
    const [first, second] = splitLiturgyBlock(block, 2);
    expect(first.items).not.toBe(block.items);
    expect(second.items).not.toBe(block.items);
    expect(first.items).not.toBe(second.items);
  });
});
