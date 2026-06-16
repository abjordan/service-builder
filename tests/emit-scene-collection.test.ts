import { describe, it, expect } from "vitest";
import {
  emitSceneCollection,
  emitMultiSceneCollection,
  type Stage1Plan,
  type SceneSpec,
} from "../lib/emit-scene-collection";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PLAN: Stage1Plan = {
  collectionName: "Sunday Service",
  sceneName: "Hymn Scene",
  slideAbsolutePath: "/tmp/slide.png",
};

describe("emitSceneCollection", () => {
  it("has all required top-level keys with correct types", () => {
    const result = emitSceneCollection(PLAN);

    expect(typeof result.name).toBe("string");
    expect(typeof result.version).toBe("number");
    expect(typeof result.current_scene).toBe("string");
    expect(typeof result.current_program_scene).toBe("string");
    expect(typeof result.current_transition).toBe("string");
    expect(typeof result.transition_duration).toBe("number");
    expect(Array.isArray(result.scene_order)).toBe(true);
    expect(Array.isArray(result.transitions)).toBe(true);
    expect(Array.isArray(result.sources)).toBe(true);
    expect(Array.isArray(result.groups)).toBe(true);
    expect(typeof result.modules).toBe("object");
    expect(Array.isArray(result.quick_transitions)).toBe(true);
  });

  it("version is the integer 1", () => {
    const result = emitSceneCollection(PLAN);
    expect(result.version).toBe(1);
  });

  it("current_scene and current_program_scene equal plan.sceneName", () => {
    const result = emitSceneCollection(PLAN);
    expect(result.current_scene).toBe(PLAN.sceneName);
    expect(result.current_program_scene).toBe(PLAN.sceneName);
  });

  it("scene_order has exactly one entry with the scene name", () => {
    const result = emitSceneCollection(PLAN);
    const order = result.scene_order as Array<{ name: string }>;
    expect(order).toHaveLength(1);
    expect(order[0].name).toBe(PLAN.sceneName);
  });

  it("sources has exactly two entries: one slideshow and one scene", () => {
    const result = emitSceneCollection(PLAN);
    const sources = result.sources as Array<{ id: string }>;
    expect(sources).toHaveLength(2);
    expect(sources.some((s) => s.id === "slideshow")).toBe(true);
    expect(sources.some((s) => s.id === "scene")).toBe(true);
  });

  it("scene item source_uuid matches the slideshow source uuid", () => {
    const result = emitSceneCollection(PLAN);
    const sources = result.sources as Array<Record<string, unknown>>;

    const slideshow = sources.find((s) => s.id === "slideshow") as Record<string, unknown>;
    const scene = sources.find((s) => s.id === "scene") as Record<string, unknown>;

    const slideshowUuid = slideshow.uuid as string;
    const settings = scene.settings as { items: Array<{ source_uuid: string }> };
    const itemSourceUuid = settings.items[0].source_uuid;

    expect(itemSourceUuid).toBe(slideshowUuid);
  });

  it("slideshow settings.files[0].value equals plan.slideAbsolutePath", () => {
    const result = emitSceneCollection(PLAN);
    const sources = result.sources as Array<Record<string, unknown>>;
    const slideshow = sources.find((s) => s.id === "slideshow") as Record<string, unknown>;
    const settings = slideshow.settings as { files: Array<{ value: string }> };

    expect(settings.files[0].value).toBe(PLAN.slideAbsolutePath);
  });

  it("all UUIDs are valid v4 and unique within the document", () => {
    const result = emitSceneCollection(PLAN);
    const sources = result.sources as Array<Record<string, unknown>>;

    const slideshow = sources.find((s) => s.id === "slideshow") as Record<string, unknown>;
    const scene = sources.find((s) => s.id === "scene") as Record<string, unknown>;
    const slideshowSettings = slideshow.settings as { files: Array<{ uuid: string }> };

    const slideshowUuid = slideshow.uuid as string;
    const fileUuid = slideshowSettings.files[0].uuid as string;
    const sceneUuid = scene.uuid as string;

    const allUuids = [slideshowUuid, fileUuid, sceneUuid];

    for (const id of allUuids) {
      expect(id).toMatch(UUID_V4_RE);
    }

    // All three must be distinct
    const uniqueSet = new Set(allUuids);
    expect(uniqueSet.size).toBe(3);
  });

  it("two successive calls with the same plan produce different UUIDs", () => {
    const result1 = emitSceneCollection(PLAN);
    const result2 = emitSceneCollection(PLAN);

    const sources1 = result1.sources as Array<Record<string, unknown>>;
    const sources2 = result2.sources as Array<Record<string, unknown>>;

    const uuid1 = (sources1.find((s) => s.id === "slideshow") as Record<string, unknown>).uuid;
    const uuid2 = (sources2.find((s) => s.id === "slideshow") as Record<string, unknown>).uuid;

    expect(uuid1).not.toBe(uuid2);
  });

  it("scene canvas_uuid is the OBS main canvas sentinel", () => {
    const result = emitSceneCollection(PLAN);
    const sources = result.sources as Array<Record<string, unknown>>;
    const scene = sources.find((s) => s.id === "scene") as Record<string, unknown>;

    expect(scene.canvas_uuid).toBe("6c69626f-6273-4c00-9d88-c5136d61696e");
  });
});

// ---------------------------------------------------------------------------
// emitMultiSceneCollection
// ---------------------------------------------------------------------------

const MULTI_SCENES: SceneSpec[] = [
  { name: "Confession and Absolution — line 0", imagePath: "/tmp/svc/assets/01-s0-liturgy-0.png" },
  { name: "Confession and Absolution — line 1", imagePath: "/tmp/svc/assets/02-s0-liturgy-1.png" },
  { name: "Holy Gospel — announce",              imagePath: "/tmp/svc/assets/03-s1-reading-0.png" },
];

describe("emitMultiSceneCollection", () => {
  it("has the expected collection name", () => {
    const result = emitMultiSceneCollection("2026-06-14 Livestream", MULTI_SCENES);
    expect(result.name).toBe("2026-06-14 Livestream");
  });

  it("scene_order length equals number of scenes", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    const order = result.scene_order as Array<{ name: string }>;
    expect(order).toHaveLength(MULTI_SCENES.length);
  });

  it("scene_order names match the scene spec names in order", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    const order = result.scene_order as Array<{ name: string }>;
    for (let i = 0; i < MULTI_SCENES.length; i++) {
      expect(order[i].name).toBe(MULTI_SCENES[i].name);
    }
  });

  it("sources has 2 entries per scene (image_source + scene)", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    const sources = result.sources as Array<{ id: string }>;
    expect(sources).toHaveLength(MULTI_SCENES.length * 2);
  });

  it("each scene source references its paired image_source uuid", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    const sources = result.sources as Array<Record<string, unknown>>;

    // Sources are interleaved: [img0, scene0, img1, scene1, ...]
    for (let i = 0; i < MULTI_SCENES.length; i++) {
      const imgSource = sources[i * 2];
      const sceneSource = sources[i * 2 + 1];

      expect(imgSource.id).toBe("image_source");
      expect(sceneSource.id).toBe("scene");

      const imgUuid = imgSource.uuid as string;
      const settings = sceneSource.settings as { items: Array<{ source_uuid: string }> };
      expect(settings.items[0].source_uuid).toBe(imgUuid);
    }
  });

  it("each image_source settings.file equals the corresponding scene spec imagePath", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    const sources = result.sources as Array<Record<string, unknown>>;

    for (let i = 0; i < MULTI_SCENES.length; i++) {
      const imgSource = sources[i * 2];
      const settings = imgSource.settings as { file: string };
      expect(settings.file).toBe(MULTI_SCENES[i].imagePath);
    }
  });

  it("current_scene and current_program_scene equal the first scene name", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    expect(result.current_scene).toBe(MULTI_SCENES[0].name);
    expect(result.current_program_scene).toBe(MULTI_SCENES[0].name);
  });

  it("all scene canvas_uuid values are the OBS main canvas sentinel", () => {
    const result = emitMultiSceneCollection("Test", MULTI_SCENES);
    const sources = result.sources as Array<Record<string, unknown>>;
    const sceneEntries = sources.filter((s) => s.id === "scene");
    for (const scene of sceneEntries) {
      expect(scene.canvas_uuid).toBe("6c69626f-6273-4c00-9d88-c5136d61696e");
    }
  });

  it("throws when given an empty scenes array", () => {
    expect(() => emitMultiSceneCollection("Test", [])).toThrow();
  });
});
