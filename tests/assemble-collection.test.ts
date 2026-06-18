import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupSlidesIntoSceneSpecs,
  spliceContentScenes,
} from "../lib/assemble-collection";
import { expandPlan } from "../lib/expand-plan";
import type { ServicePlan } from "../lib/service-plan";
import type { ExpandedSlide } from "../lib/expand-plan";
import type { HymnLibrary } from "../lib/hymn-library";
import type { SceneCollection } from "../lib/emit-scene-collection";

function loadBase(): SceneCollection {
  return JSON.parse(
    readFileSync(join(__dirname, "../lib/base-template.json"), "utf-8"),
  ) as SceneCollection;
}
function loadPlan(): ServicePlan {
  return JSON.parse(
    readFileSync(join(__dirname, "../examples/20260614/parsed-plan.json"), "utf-8"),
  ) as ServicePlan;
}
function loadLibrary(): HymnLibrary {
  return JSON.parse(
    readFileSync(join(__dirname, "../data/hymns.json"), "utf-8"),
  ) as HymnLibrary;
}

function fakeSlide(
  sectionIndex: number,
  kind: ExpandedSlide["slide"]["kind"],
  n: number,
): ExpandedSlide {
  const slide =
    kind === "hymn"
      ? { kind: "hymn" as const, title: "T", blocks: [{ lines: ["x"] }] }
      : kind === "reading"
        ? {
            kind: "reading" as const,
            title: "R",
            citation: "C",
            responseA: "a",
            responseC: "c",
          }
        : { kind: "liturgy" as const, items: [{ speaker: "P" as const, text: "x" }] };
  return { id: `s${sectionIndex}-${n}`, sectionIndex, slide };
}

const pathFor = (s: ExpandedSlide, i: number) => `/svc/${i}-${s.id}.png`;

describe("groupSlidesIntoSceneSpecs", () => {
  const plan = {
    metadata: { serviceDate: "2026-06-21", liturgicalDay: "T", church: { name: "LCS" } },
    sections: [
      { kind: "song", title: "Opening Hymn Name" },
      { kind: "liturgy", title: "Confession" },
      { kind: "song", title: "Opening Hymn Name" },
    ],
  } as unknown as ServicePlan;

  it("makes one scene spec per contiguous section, in order", () => {
    const slides = [
      fakeSlide(0, "hymn", 0),
      fakeSlide(0, "hymn", 1),
      fakeSlide(1, "liturgy", 0),
      fakeSlide(2, "hymn", 0),
    ];
    const specs = groupSlidesIntoSceneSpecs(plan, slides, pathFor);
    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.kind)).toEqual(["hymn", "strip", "hymn"]);
    expect(specs[0].imagePaths).toHaveLength(2);
  });

  it("derives scene names from section titles and dedupes collisions", () => {
    const slides = [
      fakeSlide(0, "hymn", 0),
      fakeSlide(1, "liturgy", 0),
      fakeSlide(2, "hymn", 0),
    ];
    const specs = groupSlidesIntoSceneSpecs(plan, slides, pathFor);
    expect(specs.map((s) => s.name)).toEqual([
      "Opening Hymn Name",
      "Confession",
      "Opening Hymn Name (2)",
    ]);
  });

  it("maps reading slides to the strip layout", () => {
    const specs = groupSlidesIntoSceneSpecs(
      plan,
      [fakeSlide(1, "reading", 0)],
      pathFor,
    );
    expect(specs[0].kind).toBe("strip");
  });
});

describe("spliceContentScenes", () => {
  const base = loadBase();

  const specs = [
    { name: "Opening Hymn Name", kind: "hymn" as const, imagePaths: ["/a.png"] },
    { name: "Confession", kind: "strip" as const, imagePaths: ["/b.png", "/c.png"] },
  ];

  it("inserts generated scenes between Welcome and Thanks in scene_order", () => {
    const out = spliceContentScenes(base, specs, { collectionName: "Svc" });
    const order = (out.scene_order as { name: string }[]).map((o) => o.name);
    const welcome = order.indexOf("Welcome");
    const thanks = order.indexOf("Thanks");
    expect(welcome).toBeGreaterThanOrEqual(0);
    expect(order.slice(welcome + 1, thanks)).toEqual([
      "Opening Hymn Name",
      "Confession",
    ]);
  });

  it("adds a scene + slideshow source for each spec", () => {
    const before = (base.sources as unknown[]).length;
    const out = spliceContentScenes(base, specs, { collectionName: "Svc" });
    expect((out.sources as unknown[]).length).toBe(before + specs.length * 2);
  });

  it("wires generated scenes to the base's shared camera", () => {
    const out = spliceContentScenes(base, specs, { collectionName: "Svc" });
    const sources = out.sources as Array<Record<string, unknown>>;
    const cam = sources.find((s) => s.id === "dshow_input")!;
    const scene = sources.find((s) => s.name === "Opening Hymn Name")!;
    const items = (scene.settings as { items: { source_uuid: string }[] }).items;
    expect(items[0].source_uuid).toBe(cam.uuid);
  });

  it("sets the collection name and does not mutate the base", () => {
    const beforeOrder = (base.scene_order as unknown[]).length;
    const out = spliceContentScenes(base, specs, { collectionName: "My Service" });
    expect(out.name).toBe("My Service");
    expect((base.scene_order as unknown[]).length).toBe(beforeOrder);
  });

  it("end to end: real plan + library produces one scene per included section", () => {
    const plan = loadPlan();
    const library = loadLibrary();
    const { slides } = expandPlan(plan, { library });
    const realSpecs = groupSlidesIntoSceneSpecs(plan, slides, pathFor);
    const out = spliceContentScenes(base, realSpecs, { collectionName: "X" });
    const order = (out.scene_order as { name: string }[]).map((o) => o.name);
    for (const spec of realSpecs) {
      expect(order).toContain(spec.name);
    }
  });
});
