// Derives a reusable OBS "base template" from a hand-built scene collection.
//
// Stage 5 assembles each week's bundle by splicing generated content scenes
// into a base that supplies the broadcast infrastructure (camera, audio,
// intro/outro videos, backgrounds, transitions) plus the static bookend
// scenes the volunteers know (Intro, Welcome / Thanks, Outro, Black).
//
// This is a pure transform: keep the bookend scenes, the transitive closure of
// every source/group they reference, and the global audio/transition config;
// drop the dated content scenes and empty any leftover slideshow file lists so
// no service-specific paths leak into the template.

import type { SceneCollection } from "./emit-scene-collection";

// Bookend scenes carried through unchanged, in broadcast order. The two "Black"
// names are the exact (whitespace-laden) names from the reference collection.
export const DEFAULT_BOOKEND_SCENES: readonly string[] = [
  "Black ------------------------------------------- 2",
  "Intro",
  "Welcome",
  "Thanks",
  "Outro",
  "Black ---------------",
];

type ObsSource = Record<string, unknown> & {
  uuid?: string;
  name?: string;
  id?: string;
  settings?: Record<string, unknown>;
};

type SceneItem = { source_uuid?: string };

function sceneItems(src: ObsSource): SceneItem[] {
  const items = src.settings?.items;
  return Array.isArray(items) ? (items as SceneItem[]) : [];
}

// Slideshow sources kept from the base (e.g. Outro's "Announcements") get their
// file list emptied so no dated, machine-specific paths survive in the template.
function stripSlideshowFiles(src: ObsSource): ObsSource {
  if (src.id !== "slideshow") return src;
  return { ...src, settings: { ...(src.settings ?? {}), files: [] } };
}

export type DeriveBaseTemplateOptions = {
  /** Collection name for the derived base. */
  name?: string;
  /** Override which scenes are carried through. Defaults to the bookends. */
  keepScenes?: readonly string[];
};

export function deriveBaseTemplate(
  ref: SceneCollection,
  opts: DeriveBaseTemplateOptions = {},
): SceneCollection {
  const keepNames = new Set(opts.keepScenes ?? DEFAULT_BOOKEND_SCENES);

  const sources = (ref.sources as ObsSource[]) ?? [];
  const groups = (ref.groups as ObsSource[]) ?? [];

  // A source_uuid in a scene item may resolve to either a source or a group.
  const byUuid = new Map<string, ObsSource>();
  for (const s of [...sources, ...groups]) {
    if (typeof s.uuid === "string") byUuid.set(s.uuid, s);
  }
  const byName = new Map<string, ObsSource>();
  for (const s of sources) {
    if (typeof s.name === "string") byName.set(s.name, s);
  }

  // Seed the closure with the kept scenes, then BFS over item references.
  // Scenes and groups both carry `settings.items`, so the same walk reaches
  // sources nested inside groups.
  const keptUuids = new Set<string>();
  const queue: ObsSource[] = [];
  for (const name of keepNames) {
    const scene = byName.get(name);
    if (scene && typeof scene.uuid === "string" && !keptUuids.has(scene.uuid)) {
      keptUuids.add(scene.uuid);
      queue.push(scene);
    }
  }
  while (queue.length > 0) {
    const src = queue.shift()!;
    for (const item of sceneItems(src)) {
      const u = item.source_uuid;
      if (typeof u === "string" && !keptUuids.has(u) && byUuid.has(u)) {
        keptUuids.add(u);
        queue.push(byUuid.get(u)!);
      }
    }
  }

  const keep = (s: ObsSource) =>
    typeof s.uuid === "string" && keptUuids.has(s.uuid);

  const keptSources = sources.filter(keep).map(stripSlideshowFiles);
  const keptGroups = groups.filter(keep).map(stripSlideshowFiles);

  const sceneOrder = (
    Array.isArray(ref.scene_order) ? (ref.scene_order as { name: string }[]) : []
  ).filter((o) => keepNames.has(o.name));

  const first = sceneOrder[0]?.name;

  return {
    ...ref,
    name: opts.name ?? "Service Builder Base",
    sources: keptSources,
    groups: keptGroups,
    scene_order: sceneOrder,
    current_scene: first,
    current_program_scene: first,
  };
}
