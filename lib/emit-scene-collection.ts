export type Stage1Plan = {
  collectionName: string;
  sceneName: string;
  slideAbsolutePath: string;
};

export type SceneCollection = Record<string, unknown>;

// Trailing fields shared by both the slideshow source and the scene source.
const SHARED_TRAILING: Record<string, unknown> = {
  mixers: 0,
  sync: 0,
  flags: 0,
  volume: 1.0,
  balance: 0.5,
  enabled: true,
  muted: false,
  "push-to-mute": false,
  "push-to-mute-delay": 0,
  "push-to-talk": false,
  "push-to-talk-delay": 0,
  deinterlace_mode: 0,
  deinterlace_field_order: 0,
  monitoring_type: 0,
  private_settings: {},
};

// The sentinel UUID OBS uses to identify the main canvas.
const MAIN_CANVAS_UUID = "6c69626f-6273-4c00-9d88-c5136d61696e";

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export function emitSceneCollection(plan: Stage1Plan): SceneCollection {
  const slideshowUuid = uuid();
  const fileUuid = uuid();
  const sceneUuid = uuid();

  const slideshowSource: Record<string, unknown> = {
    prev_ver: 536936450,
    name: "Hymn Slideshow",
    uuid: slideshowUuid,
    id: "slideshow",
    versioned_id: "slideshow",
    settings: {
      files: [
        {
          value: plan.slideAbsolutePath,
          uuid: fileUuid,
          selected: false,
          hidden: false,
        },
      ],
      slide_time: 12000,
      playback_behavior: "stop_restart",
    },
    ...SHARED_TRAILING,
    hotkeys: {},
  };

  const sceneSource: Record<string, unknown> = {
    prev_ver: 536936450,
    name: plan.sceneName,
    uuid: sceneUuid,
    id: "scene",
    versioned_id: "scene",
    canvas_uuid: MAIN_CANVAS_UUID,
    settings: {
      custom_size: false,
      id_counter: 1,
      items: [
        {
          name: "Hymn Slideshow",
          source_uuid: slideshowUuid,
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
          id: 1,
          group_item_backup: false,
          pos: { x: 0.0, y: 0.0 },
          scale: { x: 1.0, y: 1.0 },
          bounds: { x: 0.0, y: 0.0 },
          scale_filter: "disable",
          blend_method: "default",
          blend_type: "normal",
          show_transition: { duration: 0 },
          hide_transition: { duration: 0 },
          private_settings: {},
        },
      ],
    },
    ...SHARED_TRAILING,
    hotkeys: {
      "OBSBasic.SelectScene": [],
      "libobs.show_scene_item.1": [],
      "libobs.hide_scene_item.1": [],
    },
  };

  return {
    name: plan.collectionName,
    version: 1,
    current_scene: plan.sceneName,
    current_program_scene: plan.sceneName,
    current_transition: "Fade",
    transition_duration: 300,
    scene_order: [{ name: plan.sceneName }],
    transitions: [],
    sources: [slideshowSource, sceneSource],
    groups: [],
    modules: {},
    quick_transitions: [],
  };
}
