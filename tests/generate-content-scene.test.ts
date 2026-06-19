import { describe, it, expect } from "vitest";
import { generateContentScene } from "../lib/generate-content-scene";

const MAIN_CANVAS_UUID = "6c69626f-6273-4c00-9d88-c5136d61696e";
const camera = { name: "Video Capture Device", uuid: "cam-uuid-1234" };

type Item = {
  name: string;
  source_uuid: string;
  id: number;
  pos: { x: number; y: number };
  scale: { x: number; y: number };
};

function items(scene: Record<string, unknown>): Item[] {
  return (scene.settings as { items: Item[] }).items;
}

describe("generateContentScene", () => {
  it("builds a slideshow source listing the image paths in order", () => {
    const paths = ["/x/01.png", "/x/02.png", "/x/03.png"];
    const { slideshowSource } = generateContentScene({
      sceneName: "Opening Hymn",
      kind: "hymn",
      imagePaths: paths,
      camera,
    });
    expect(slideshowSource.id).toBe("slideshow");
    const files = (slideshowSource.settings as { files: { value: string }[] })
      .files;
    expect(files.map((f) => f.value)).toEqual(paths);
    expect(
      (slideshowSource.settings as { slide_mode: string }).slide_mode,
    ).toBe("mode_manual");
  });

  it("names the slideshow after the scene", () => {
    const { slideshowSource, sceneSource } = generateContentScene({
      sceneName: "Closing Hymn",
      kind: "hymn",
      imagePaths: ["/x/01.png"],
      camera,
    });
    expect(slideshowSource.name).toBe("Closing Hymn Slides");
    expect(sceneSource.name).toBe("Closing Hymn");
  });

  it("references the shared camera by uuid as the bottom layer", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Opening Hymn",
      kind: "hymn",
      imagePaths: ["/x/01.png"],
      camera,
    });
    const its = items(sceneSource);
    expect(its).toHaveLength(2);
    expect(its[0].name).toBe(camera.name);
    expect(its[0].source_uuid).toBe(camera.uuid);
  });

  it("the slideshow scene item points at the generated slideshow source", () => {
    const { sceneSource, slideshowSource } = generateContentScene({
      sceneName: "Gloria",
      kind: "strip",
      imagePaths: ["/x/01.png"],
      camera,
    });
    const slideItem = items(sceneSource).find((i) => i.name === "Gloria Slides");
    expect(slideItem).toBeDefined();
    expect(slideItem!.source_uuid).toBe(slideshowSource.uuid);
  });

  it("lays a hymn slideshow full-screen at scale 1.0", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Opening Hymn",
      kind: "hymn",
      imagePaths: ["/x/01.png"],
      camera,
    });
    const slide = items(sceneSource).find((i) => i.name.endsWith("Slides"))!;
    expect(slide.pos).toEqual({ x: 0, y: 0 });
    expect(slide.scale).toEqual({ x: 1, y: 1 });
  });

  it("lays a strip slideshow as a slim bottom third at pos (0,866) scale 0.5944", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Conf., Abs.",
      kind: "strip",
      imagePaths: ["/x/01.png"],
      camera,
    });
    const slide = items(sceneSource).find((i) => i.name.endsWith("Slides"))!;
    expect(slide.pos).toEqual({ x: 0, y: 866 });
    expect(slide.scale).toEqual({ x: 0.5944, y: 0.5944 });
  });

  it("omits the camera layer when no camera is given", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Solo",
      kind: "hymn",
      imagePaths: ["/x/01.png"],
    });
    const its = items(sceneSource);
    expect(its).toHaveLength(1);
    expect(its[0].name).toBe("Solo Slides");
    expect(its[0].id).toBe(1);
  });

  it("assigns sequential item ids and a matching id_counter", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Readings",
      kind: "strip",
      imagePaths: ["/x/01.png"],
      camera,
    });
    const its = items(sceneSource);
    expect(its.map((i) => i.id)).toEqual([1, 2]);
    expect((sceneSource.settings as { id_counter: number }).id_counter).toBe(3);
  });

  it("emits show/hide hotkeys for every item plus the scene selector", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Readings",
      kind: "strip",
      imagePaths: ["/x/01.png"],
      camera,
    });
    const hotkeys = sceneSource.hotkeys as Record<string, unknown>;
    expect(hotkeys["OBSBasic.SelectScene"]).toEqual([]);
    expect(hotkeys["libobs.show_scene_item.1"]).toEqual([]);
    expect(hotkeys["libobs.hide_scene_item.2"]).toEqual([]);
  });

  it("tags the scene with the main canvas sentinel", () => {
    const { sceneSource } = generateContentScene({
      sceneName: "Sermon Hymn",
      kind: "hymn",
      imagePaths: ["/x/01.png"],
      camera,
    });
    expect(sceneSource.canvas_uuid).toBe(MAIN_CANVAS_UUID);
  });

  it("gives each file entry a distinct uuid", () => {
    const { slideshowSource } = generateContentScene({
      sceneName: "Opening Hymn",
      kind: "hymn",
      imagePaths: ["/a.png", "/b.png"],
      camera,
    });
    const files = (slideshowSource.settings as { files: { uuid: string }[] })
      .files;
    expect(files[0].uuid).not.toBe(files[1].uuid);
  });

  it("throws when given no image paths", () => {
    expect(() =>
      generateContentScene({
        sceneName: "Empty",
        kind: "hymn",
        imagePaths: [],
        camera,
      }),
    ).toThrow(/no image paths/);
  });
});
