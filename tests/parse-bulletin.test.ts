import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseBulletin } from "../lib/parse-bulletin";
import type { ParseResult, LiturgyBlock, Song, Reading, SectionHeader, Note } from "../lib/service-plan";

const FIXTURE_PATH = join(
  __dirname,
  "../examples/20260614/2026-06-14 Third Sunday after Pentecost - Livestream.pdf"
);

let result: ParseResult;

beforeAll(async () => {
  const buf = readFileSync(FIXTURE_PATH);
  result = await parseBulletin(buf);
}, 30_000);

describe("parseBulletin — fixture PDF", () => {
  // 1. Returns a ParseResult
  it("returns a ParseResult with plan and warnings", () => {
    expect(result).toBeDefined();
    expect(result.plan).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.plan.sections)).toBe(true);
  });

  // 2. serviceDate
  it("metadata.serviceDate is 2026-06-14", () => {
    expect(result.plan.metadata.serviceDate).toBe("2026-06-14");
  });

  // 3. serviceTime
  it("metadata.serviceTime contains 10:45", () => {
    expect(result.plan.metadata.serviceTime).toMatch(/10:45/);
  });

  // 4. church.name
  it("metadata.church.name contains Lutheran Church of the Savior", () => {
    expect(result.plan.metadata.church.name).toContain("Lutheran Church of the Savior");
  });

  // 5. pastor
  it("metadata.pastor contains Nils Niemeier", () => {
    expect(result.plan.metadata.pastor).toContain("Nils Niemeier");
  });

  // 6. Confession and Absolution is a liturgy section
  it("sections includes 'Confession and Absolution' as kind=liturgy", () => {
    const section = result.plan.sections.find(
      (s) => s.kind === "liturgy" && (s as LiturgyBlock).title?.startsWith("Confession and Absolution")
    );
    expect(section).toBeDefined();
    expect(section?.kind).toBe("liturgy");
  });

  // 7. At least 4 Song sections
  it("sections includes at least 4 Song sections", () => {
    const songs = result.plan.sections.filter((s) => s.kind === "song");
    expect(songs.length).toBeGreaterThanOrEqual(4);
  });

  // 8. First Song is Everlasting God
  it("first Song section has title='Everlasting God' and authors='Brown, Riley'", () => {
    const songs = result.plan.sections.filter((s) => s.kind === "song") as Song[];
    expect(songs.length).toBeGreaterThan(0);
    expect(songs[0].title).toBe("Everlasting God");
    expect(songs[0].authors).toBe("Brown, Riley");
  });

  // 9. Reading: Old Testament Reading with Exodus citation
  it("sections includes a Reading for Old Testament Reading with Exodus citation", () => {
    const reading = result.plan.sections.find(
      (s) => s.kind === "reading" && (s as Reading).title === "Old Testament Reading"
    ) as Reading | undefined;
    expect(reading).toBeDefined();
    expect(reading?.citation).toMatch(/Exodus/);
  });

  // 10. Service of the Word is a section header
  it("sections includes 'Service of the Word' as kind=header", () => {
    const header = result.plan.sections.find(
      (s) => s.kind === "header" && (s as SectionHeader).title === "Service of the Word"
    );
    expect(header).toBeDefined();
    expect(header?.kind).toBe("header");
  });

  // 11. Confession block contains P speaker with "In the name of the Father"
  it("Confession liturgy block contains P speaker starting 'In the name of the Father'", () => {
    const confession = result.plan.sections.find(
      (s) => s.kind === "liturgy" && (s as LiturgyBlock).title?.startsWith("Confession and Absolution")
    ) as LiturgyBlock | undefined;
    expect(confession).toBeDefined();
    const item = confession?.items.find(
      (it) => it.kind === "spoken" && it.speaker === "P" && it.text.startsWith("In the name of the Father")
    );
    expect(item).toBeDefined();
  });

  // 12. Confession block contains Stand or Kneel/Stand rubric
  it("Confession liturgy block contains a 'Stand' or 'Kneel/Stand' rubric", () => {
    const confession = result.plan.sections.find(
      (s) => s.kind === "liturgy" && (s as LiturgyBlock).title?.startsWith("Confession and Absolution")
    ) as LiturgyBlock | undefined;
    expect(confession).toBeDefined();
    const rubric = confession?.items.find(
      (it) => it.kind === "rubric" && (it.text === "Stand" || it.text === "Kneel/Stand")
    );
    expect(rubric).toBeDefined();
  });

  // 13. No numeric-only rubrics in Psalm section
  it("Psalm section contains no numeric-only rubric items (verse artifacts stripped)", () => {
    const psalm = result.plan.sections.find(
      (s) => s.kind === "liturgy" && (s as LiturgyBlock).title?.startsWith("Psalm")
    ) as LiturgyBlock | undefined;
    expect(psalm).toBeDefined();
    const numericRubric = psalm?.items.find(
      (it) => it.kind === "rubric" && /^\d+$/.test(it.text.trim())
    );
    expect(numericRubric).toBeUndefined();
  });

  // 14. Acknowledgments is a Note section
  it("sections includes 'Acknowledgments' as kind=note", () => {
    const ack = result.plan.sections.find(
      (s) => s.kind === "note" && (s as Note).title === "Acknowledgments"
    );
    expect(ack).toBeDefined();
    expect(ack?.kind).toBe("note");
  });

  // Regression: warning count and section count sanity checks
  it("warnings count is fewer than 20", () => {
    expect(result.warnings.length).toBeLessThan(20);
  });

  it("sections count is greater than 10", () => {
    expect(result.plan.sections.length).toBeGreaterThan(10);
  });
});
