import { describe, it, expect } from "vitest";
import { linesToText, textToLines } from "../app/hymns/lyric-text";

describe("linesToText", () => {
  it("joins lines with newlines", () => {
    expect(linesToText(["a", "b", "c"])).toBe("a\nb\nc");
  });

  it("returns empty string for empty array", () => {
    expect(linesToText([])).toBe("");
  });

  it("preserves interior blank lines", () => {
    expect(linesToText(["a", "", "c"])).toBe("a\n\nc");
  });
});

describe("textToLines", () => {
  it("splits on newlines", () => {
    expect(textToLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty string", () => {
    expect(textToLines("")).toEqual([]);
  });

  it("drops trailing blank lines", () => {
    expect(textToLines("a\nb\n\n")).toEqual(["a", "b"]);
  });

  it("preserves interior blank lines", () => {
    expect(textToLines("a\n\nc")).toEqual(["a", "", "c"]);
  });

  it("round-trips with linesToText", () => {
    const lines = ["verse one", "", "verse two"];
    expect(textToLines(linesToText(lines))).toEqual(lines);
  });

  it("handles a single line with no trailing newline", () => {
    expect(textToLines("only line")).toEqual(["only line"]);
  });
});
