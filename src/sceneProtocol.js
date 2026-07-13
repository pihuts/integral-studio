/**
 * Iframe control protocol — shared contract for parent ↔ animation host.
 * Transport is postMessage; this module owns action names and payload shape.
 */

export const SCENE_MESSAGE_TYPE = "integral-studio";

/** Actions parent → iframe */
export const PARENT_ACTIONS = Object.freeze([
  "setShells",
  "setSpeed",
  "setProgress",
  "play",
  "pause",
  "resetPlayback",
  "resetView",
  "setExample",
  "setPalette",
  "setPlaybackMode"
]);

/** Actions iframe → parent */
export const CHILD_ACTIONS = Object.freeze([
  "ready",
  "progress",
  "step",
  "error"
]);

export function isSceneMessage(data) {
  return Boolean(data && data.type === SCENE_MESSAGE_TYPE && typeof data.action === "string");
}

export function parentEnvelope(action, payload = {}) {
  return { type: SCENE_MESSAGE_TYPE, action, ...payload };
}

export function childEnvelope(action, payload = {}) {
  return { type: SCENE_MESSAGE_TYPE, action, ...payload };
}

/** Encode a visualSpec for the iframe URL bootstrap (single preferred path). */
export function encodeVisualConfig(spec) {
  return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(spec)))));
}

export function encodePaletteParam(palette) {
  try {
    return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(palette)))));
  } catch {
    return "";
  }
}

/**
 * Build legacy-animation.html query. Prefer config; a/b/n are demo-only fallbacks.
 */
export function buildSceneUrl({
  origin = "",
  visualSpec = null,
  mode = "area",
  a = 1,
  b = 1,
  n = 1,
  alternate = false,
  shells = 16,
  speed = 1,
  canvasColor = "ede6d8",
  palette = null
} = {}) {
  const base = `${origin}/legacy-animation.html`;
  const params = new URLSearchParams();
  params.set("example", "dynamic");
  params.set("mode", mode);
  params.set("method", alternate ? "washers" : "shells");
  params.set("shells", String(shells));
  params.set("speed", String(speed));
  params.set("canvas", String(canvasColor).replace("#", ""));
  // Only attach a/b/n when no structured config (legacy / standalone demos).
  if (!visualSpec) {
    params.set("a", String(a));
    params.set("b", String(b));
    params.set("n", String(n));
  }
  let qs = params.toString();
  if (visualSpec) {
    try {
      qs += `&config=${encodeVisualConfig(visualSpec)}`;
    } catch {
      /* omit corrupt config */
    }
  }
  const paletteParam = palette ? encodePaletteParam(palette) : "";
  if (paletteParam) qs += `&palette=${paletteParam}`;
  return `${base}?${qs}`;
}
