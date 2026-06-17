import { describe, it, expect } from "vitest";
import { normalizeTitle, isTitleKnown } from "../lib/hymn-match";

describe("normalizeTitle", () => {
  it("lowercases the input", () => {
    expect(normalizeTitle("Everlasting God")).toBe("everlasting god");
  });

  it("strips punctuation", () => {
    expect(normalizeTitle("My Hope!")).toBe("my hope");
    expect(normalizeTitle("Lord, I Lift Your Name On High")).toBe(
      "lord i lift your name on high"
    );
  });

  it("collapses internal whitespace", () => {
    expect(normalizeTitle("How  Great   Thou Art")).toBe("how great thou art");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTitle("  Amazing Grace  ")).toBe("amazing grace");
  });
});

describe("isTitleKnown", () => {
  const library = ["Everlasting God", "My Hope", "Amazing Grace"];

  it("returns true for an exact match", () => {
    expect(isTitleKnown(library, "Everlasting God")).toBe(true);
  });

  it("returns true for a case-insensitive match", () => {
    expect(isTitleKnown(library, "everlasting god")).toBe(true);
    expect(isTitleKnown(library, "AMAZING GRACE")).toBe(true);
  });

  it("returns true when punctuation differs", () => {
    expect(isTitleKnown(library, "My Hope!")).toBe(true);
  });

  it("returns false for a title not in the library", () => {
    expect(isTitleKnown(library, "Holy, Holy, Holy")).toBe(false);
  });

  it("returns true for an empty title", () => {
    expect(isTitleKnown(library, "")).toBe(true);
  });

  it("returns true for a whitespace-only title", () => {
    expect(isTitleKnown(library, "   ")).toBe(true);
  });

  it("returns false for a real title when the library is empty", () => {
    expect(isTitleKnown([], "Everlasting God")).toBe(false);
  });
});
