// Assembles the final OBS scene collection (Stage 5c).
//
// Two pure steps:
//   1. groupSlidesIntoSceneSpecs — fold the flat ExpandedSlide list back into
//      one scene spec per service section (name + layout kind + image paths).
//   2. spliceContentScenes — generate a content scene for each spec and weave
//      them into the base template's scene_order, between the front bookends
//      (Black/Intro/Welcome) and the back bookends (Thanks/Outro/Black).

import type { ServicePlan } from "./service-plan";
import type { ExpandedSlide } from "./expand-plan";
import type { SceneCollection } from "./emit-scene-collection";
import {
  generateContentScene,
  type ContentSlideKind,
  type SharedSourceRef,
} from "./generate-content-scene";

export type SectionSceneSpec = {
  name: string;
  kind: ContentSlideKind;
  imagePaths: string[];
};

// liturgy/reading render as lower-third strips; hymns render full-screen.
function layoutKind(slideKind: ExpandedSlide["slide"]["kind"]): ContentSlideKind {
  return slideKind === "hymn" ? "hymn" : "strip";
}

function sectionName(plan: ServicePlan, sectionIndex: number): string {
  const section = plan.sections[sectionIndex] as { title?: string } | undefined;
  const title = section?.title?.trim();
  return title && title.length > 0 ? title : `Scene ${sectionIndex + 1}`;
}

// OBS scene names must be unique; disambiguate repeats with a numeric suffix.
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  const name = `${base} (${n})`;
  used.add(name);
  return name;
}

/**
 * Groups expanded slides into one scene spec per section, in plan order.
 * `pathFor` returns the absolute on-disk path for a given expanded slide and
 * its global index (the caller renders the PNGs and decides the naming).
 */
export function groupSlidesIntoSceneSpecs(
  plan: ServicePlan,
  slides: ExpandedSlide[],
  pathFor: (slide: ExpandedSlide, index: number) => string,
): SectionSceneSpec[] {
  const specs: SectionSceneSpec[] = [];
  const usedNames = new Set<string>();

  let i = 0;
  while (i < slides.length) {
    const sectionIndex = slides[i].sectionIndex;
    const imagePaths: string[] = [];
    const firstKind = slides[i].slide.kind;
    while (i < slides.length && slides[i].sectionIndex === sectionIndex) {
      imagePaths.push(pathFor(slides[i], i));
      i++;
    }
    specs.push({
      name: uniqueName(sectionName(plan, sectionIndex), usedNames),
      kind: layoutKind(firstKind),
      imagePaths,
    });
  }

  return specs;
}

function findCamera(
  sources: Array<Record<string, unknown>>,
): SharedSourceRef | undefined {
  const cam = sources.find((s) => s.id === "dshow_input");
  if (cam && typeof cam.uuid === "string" && typeof cam.name === "string") {
    return { name: cam.name, uuid: cam.uuid };
  }
  return undefined;
}

export type SpliceOptions = {
  /** OBS scene-collection name (shown in the Scene Collection menu). */
  collectionName: string;
  /**
   * Insert generated scenes immediately after this base scene. Defaults to
   * "Welcome" — content lands between the opening and closing bookends.
   */
  insertAfter?: string;
};

/**
 * Splices generated content scenes into a base template and returns a new
 * scene collection. Does not mutate the input base.
 */
export function spliceContentScenes(
  base: SceneCollection,
  specs: SectionSceneSpec[],
  opts: SpliceOptions,
): SceneCollection {
  const out = structuredClone(base) as SceneCollection;
  const sources = (out.sources as Array<Record<string, unknown>>) ?? [];
  const camera = findCamera(sources);

  const generatedNames: string[] = [];
  for (const spec of specs) {
    const { sceneSource, slideshowSource } = generateContentScene({
      sceneName: spec.name,
      kind: spec.kind,
      imagePaths: spec.imagePaths,
      camera,
    });
    sources.push(slideshowSource, sceneSource);
    generatedNames.push(spec.name);
  }
  out.sources = sources;

  const baseOrder = Array.isArray(out.scene_order)
    ? (out.scene_order as { name: string }[])
    : [];
  const insertAfter = opts.insertAfter ?? "Welcome";
  const idx = baseOrder.findIndex((o) => o.name === insertAfter);
  const front = idx >= 0 ? baseOrder.slice(0, idx + 1) : baseOrder;
  const back = idx >= 0 ? baseOrder.slice(idx + 1) : [];

  out.scene_order = [
    ...front,
    ...generatedNames.map((name) => ({ name })),
    ...back,
  ];
  out.name = opts.collectionName;

  return out;
}
