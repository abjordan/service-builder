// Generates a single OBS content scene for one service section (Stage 5b).
//
// A content scene composites the shared live camera (bottom layer) with a
// manual-advance `slideshow` source listing that section's rendered PNGs.
// Layout depends on slide kind, matching the reference collection:
//   - "hymn"  (1920×1080 full slides): slideshow fills the canvas, covering
//     the camera — pos (0,0), scale 1.0.
//   - "strip" (3230×360 liturgy/reading lower-thirds): scaled to span the full
//     1920 width, which lands it at 1920×214 anchored to the bottom — pos
//     (0,866), scale 0.5944 (= 1920/3230). This gives the slim ~9:1 lower
//     third of the reference deck rather than a chunky 1920×360 band.

import {
  MAIN_CANVAS_UUID,
  SHARED_TRAILING,
  uuid,
} from "./emit-scene-collection";

export type ContentSlideKind = "hymn" | "strip";

/** Reference to a source defined in the base template (e.g. the camera). */
export type SharedSourceRef = { name: string; uuid: string };

export type ContentSceneSpec = {
  /** Scene name shown in OBS (and used in scene_order). */
  sceneName: string;
  /** Layout family for the slideshow overlay. */
  kind: ContentSlideKind;
  /** Absolute PNG paths on the operator's machine, in display order. */
  imagePaths: string[];
  /**
   * Shared camera to underlay beneath the slides. Referenced by uuid from the
   * base template so every scene shares one capture device. Omit for slides
   * with no camera layer (e.g. full-screen-only output).
   */
  camera?: SharedSourceRef;
};

export type GeneratedContentScene = {
  /** The `scene` source — add to the collection's `sources`. */
  sceneSource: Record<string, unknown>;
  /** The `slideshow` source the scene references — add to `sources` too. */
  slideshowSource: Record<string, unknown>;
};

type Vec2 = { x: number; y: number };

function slideshowLayout(kind: ContentSlideKind): { pos: Vec2; scale: Vec2 } {
  switch (kind) {
    case "hymn":
      return { pos: { x: 0.0, y: 0.0 }, scale: { x: 1.0, y: 1.0 } };
    case "strip":
      return { pos: { x: 0.0, y: 866.0 }, scale: { x: 0.5944, y: 0.5944 } };
  }
}

function sceneItem(args: {
  name: string;
  sourceUuid: string;
  id: number;
  pos: Vec2;
  scale: Vec2;
}): Record<string, unknown> {
  return {
    name: args.name,
    source_uuid: args.sourceUuid,
    visible: true,
    locked: false,
    rot: 0.0,
    align: 5,
    bounds_type: 0,
    bounds_align: 0,
    bounds_crop: false,
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    id: args.id,
    group_item_backup: false,
    pos: args.pos,
    scale: args.scale,
    bounds: { x: 0.0, y: 0.0 },
    scale_filter: "disable",
    blend_method: "default",
    blend_type: "normal",
    show_transition: { duration: 0 },
    hide_transition: { duration: 0 },
    private_settings: {},
  };
}

export function generateContentScene(
  spec: ContentSceneSpec,
): GeneratedContentScene {
  if (spec.imagePaths.length === 0) {
    throw new Error(
      `generateContentScene: "${spec.sceneName}" has no image paths`,
    );
  }

  const slideshowUuid = uuid();
  const slideshowName = `${spec.sceneName} Slides`;

  const slideshowSource: Record<string, unknown> = {
    prev_ver: 536936450,
    name: slideshowName,
    uuid: slideshowUuid,
    id: "slideshow",
    versioned_id: "slideshow",
    settings: {
      files: spec.imagePaths.map((value) => ({
        value,
        uuid: uuid(),
        selected: false,
        hidden: false,
      })),
      slide_time: 3000,
      transition_speed: 300,
      playback_behavior: "stop_restart",
      // Manual: the volunteer advances slides by clicking, not on a timer.
      slide_mode: "mode_manual",
    },
    ...SHARED_TRAILING,
    hotkeys: {},
  };

  // Items bottom-to-top: camera first (if any), then the slideshow on top.
  const items: Record<string, unknown>[] = [];
  let nextId = 1;
  if (spec.camera) {
    items.push(
      sceneItem({
        name: spec.camera.name,
        sourceUuid: spec.camera.uuid,
        id: nextId++,
        pos: { x: 0.0, y: 0.0 },
        scale: { x: 1.0, y: 1.0 },
      }),
    );
  }
  const layout = slideshowLayout(spec.kind);
  items.push(
    sceneItem({
      name: slideshowName,
      sourceUuid: slideshowUuid,
      id: nextId++,
      pos: layout.pos,
      scale: layout.scale,
    }),
  );

  const hotkeys: Record<string, unknown> = { "OBSBasic.SelectScene": [] };
  for (const item of items) {
    const id = item.id as number;
    hotkeys[`libobs.show_scene_item.${id}`] = [];
    hotkeys[`libobs.hide_scene_item.${id}`] = [];
  }

  const sceneSource: Record<string, unknown> = {
    prev_ver: 536936450,
    name: spec.sceneName,
    uuid: uuid(),
    id: "scene",
    versioned_id: "scene",
    canvas_uuid: MAIN_CANVAS_UUID,
    settings: {
      custom_size: false,
      id_counter: nextId,
      items,
    },
    ...SHARED_TRAILING,
    hotkeys,
  };

  return { sceneSource, slideshowSource };
}
