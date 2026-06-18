import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveBaseTemplate,
  DEFAULT_BOOKEND_SCENES,
} from "../lib/derive-base-template";
import type { SceneCollection } from "../lib/emit-scene-collection";

const MAIN_CANVAS_UUID = "6c69626f-6273-4c00-9d88-c5136d61696e";

function loadReference(): SceneCollection {
  const raw = readFileSync(
    join(__dirname, "../examples/20260614/20260614.json"),
    "utf-8",
  );
  return JSON.parse(raw) as SceneCollection;
}

type Src = Record<string, unknown> & { id?: string; name?: string };

function sources(c: SceneCollection): Src[] {
  return (c.sources as Src[]) ?? [];
}
function scenes(c: SceneCollection): Src[] {
  return sources(c).filter((s) => s.id === "scene");
}
function names(arr: Src[]): string[] {
  return arr.map((s) => s.name as string);
}

describe("deriveBaseTemplate", () => {
  const ref = loadReference();
  const base = deriveBaseTemplate(ref);

  it("keeps exactly the bookend scenes (sources keep declaration order; broadcast order is in scene_order)", () => {
    expect(names(scenes(base)).sort()).toEqual([...DEFAULT_BOOKEND_SCENES].sort());
  });

  it("drops the dated content scenes", () => {
    const sceneNames = new Set(names(scenes(base)));
    for (const content of [
      "Opening Hymn",
      "Conf., Abs.",
      "Gloria",
      "Readings",
      "Closing Hymn",
    ]) {
      expect(sceneNames.has(content)).toBe(false);
    }
  });

  it("scene_order matches the kept scenes", () => {
    const order = (base.scene_order as { name: string }[]).map((o) => o.name);
    expect(order).toEqual([...DEFAULT_BOOKEND_SCENES]);
  });

  it("preserves shared infrastructure sources", () => {
    const ids = new Set(sources(base).map((s) => s.id));
    // Camera, intro/outro video, and backgrounds the bookends rely on.
    expect(ids.has("dshow_input")).toBe(true);
    expect(ids.has("vlc_source")).toBe(true);
    expect(ids.has("color_source")).toBe(true);
  });

  it("keeps the camera source exactly once despite being shared by Intro and Welcome", () => {
    const cameras = sources(base).filter((s) => s.id === "dshow_input");
    expect(cameras).toHaveLength(1);
  });

  it("carries through the Title Card group referenced by Intro", () => {
    const groups = (base.groups as Src[]) ?? [];
    expect(names(groups)).toContain("Title Card");
  });

  it("empties any slideshow file list carried from a bookend scene", () => {
    for (const s of sources(base)) {
      if (s.id === "slideshow") {
        const files = (s.settings as { files?: unknown[] } | undefined)?.files;
        expect(files).toEqual([]);
      }
    }
  });

  it("preserves the main canvas UUID on kept scenes", () => {
    for (const s of scenes(base)) {
      expect(s.canvas_uuid).toBe(MAIN_CANVAS_UUID);
    }
  });

  it("preserves global audio devices and transition config", () => {
    expect(base.DesktopAudioDevice1).toBeDefined();
    expect(base.AuxAudioDevice1).toBeDefined();
    expect(base.current_transition).toBe(ref.current_transition);
  });

  it("sets the collection name and current scene to the first bookend", () => {
    expect(base.name).toBe("Service Builder Base");
    expect(base.current_scene).toBe(DEFAULT_BOOKEND_SCENES[0]);
    expect(base.current_program_scene).toBe(DEFAULT_BOOKEND_SCENES[0]);
  });

  it("does not mutate the input reference", () => {
    const sceneCountBefore = scenes(ref).length;
    deriveBaseTemplate(ref);
    expect(scenes(ref).length).toBe(sceneCountBefore);
  });
});
