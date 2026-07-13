/**
 * SceneController — deep module over the iframe animation host.
 * Interface: mount / post / reset / dispose. Implementation: URL bootstrap + postMessage.
 */

import {
  SCENE_MESSAGE_TYPE,
  isSceneMessage,
  parentEnvelope,
  buildSceneUrl
} from "./sceneProtocol.js";

/** First load pulls Three.js through Vite; cold starts often exceed 8s. */
const LOAD_TIMEOUT_MS = 30000;

/**
 * @param {object} options
 * @param {string} [options.origin]
 * @param {() => object} [options.getPalette]
 * @param {(step?: string, text?: string) => void} [options.onStep]
 * @param {(progress: number, playing: boolean) => void} [options.onProgress]
 * @param {(message: string) => void} [options.onError]
 * @param {() => void} [options.onReady]
 */
export function createSceneController(options = {}) {
  const origin = options.origin || (typeof window !== "undefined" ? window.location.origin : "");
  let frame = null;
  let loadTimer = null;
  let disposed = false;
  let loadTimedOut = false;
  let sceneReady = false;

  function post(payload) {
    if (!frame?.contentWindow) return;
    const { action, ...rest } = payload;
    frame.contentWindow.postMessage(parentEnvelope(action, rest), origin);
  }

  function clearLoadTimer() {
    if (loadTimer != null) {
      window.clearTimeout(loadTimer);
      loadTimer = null;
    }
  }

  function armLoadTimer() {
    clearLoadTimer();
    loadTimer = window.setTimeout(() => {
      if (disposed || sceneReady) return;
      loadTimedOut = true;
      options.onError?.(
        "Visualization took too long to load. Check your connection and try again."
      );
    }, LOAD_TIMEOUT_MS);
  }

  function markReady() {
    // Accept late ready after a timeout so a slow first paint recovers instead of
    // leaving the error overlay up while the iframe is actually fine.
    clearLoadTimer();
    loadTimedOut = false;
    sceneReady = true;
    options.onReady?.();
  }

  function dispose() {
    disposed = true;
    clearLoadTimer();
    window.removeEventListener("message", onMessage);
    if (frame) {
      frame.removeEventListener("load", onLoad);
      frame.removeEventListener("error", onFrameError);
      frame.remove();
      frame = null;
    }
  }

  function onMessage(event) {
    if (disposed) return;
    if (event.origin !== origin) return;
    if (frame && event.source !== frame.contentWindow) return;
    if (!isSceneMessage(event.data)) return;
    const data = event.data;
    if (data.action === "ready" || data.action === "progress" || data.action === "step") {
      markReady();
    }
    if (data.action === "error") {
      clearLoadTimer();
      const message =
        typeof data.message === "string" && data.message.trim()
          ? data.message.trim().slice(0, 240)
          : "Couldn't render the visualization.";
      options.onError?.(message);
      return;
    }
    if (data.action === "progress") {
      const raw = Number(data.progress);
      const nextProgress = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      options.onProgress?.(nextProgress, Boolean(data.playing));
      return;
    }
    if (data.action === "step") {
      const step = typeof data.step === "string" ? data.step.slice(0, 32) : undefined;
      const text = typeof data.text === "string" ? data.text.slice(0, 240) : undefined;
      options.onStep?.(step, text);
    }
  }

  function onLoad() {
    if (disposed) return;
    // Document (and modules) loaded. If the scene has not signaled yet, keep waiting
    // from this point; do not re-arm after a successful ready.
    if (!sceneReady && !loadTimedOut) armLoadTimer();
    const palette = options.getPalette?.();
    if (palette) post({ action: "setPalette", palette });
    // Config was in URL; re-send only if caller supplies a live spec via lastMountSpec
    if (lastMountSpec) post({ action: "setExample", spec: lastMountSpec });
    options.onSyncControls?.();
  }

  function onFrameError() {
    clearLoadTimer();
    options.onError?.("Couldn't load the visualization. Try again.");
  }

  let lastMountSpec = null;

  /**
   * Mount (or remount) the animation iframe into hostEl.
   * @param {HTMLElement} hostEl
   * @param {object} mountOpts
   */
  function mount(hostEl, mountOpts = {}) {
    dispose();
    disposed = false;
    loadTimedOut = false;
    sceneReady = false;
    if (!hostEl) return null;

    const {
      visualSpec = null,
      mode = "area",
      a = 1,
      b = 1,
      n = 1,
      alternate = false,
      shells = 16,
      speed = 1,
      title = "Concept visualization",
      canvasColor = "ede6d8",
      palette = null
    } = mountOpts;

    lastMountSpec = visualSpec;

    const iframe = document.createElement("iframe");
    iframe.src = buildSceneUrl({
      origin: "",
      visualSpec,
      mode,
      a,
      b,
      n,
      alternate,
      shells,
      speed,
      canvasColor,
      palette
    });
    iframe.title = title;
    iframe.tabIndex = 0;
    iframe.className = "legacy-animation";
    iframe.setAttribute(
      "aria-label",
      `${title}. Interactive 3D diagram. Use the camera controls below, or focus the diagram and use arrow keys, plus/minus, and R.`
    );
    hostEl.querySelector(".legacy-animation")?.remove();
    hostEl.append(iframe);
    frame = iframe;

    armLoadTimer();

    iframe.addEventListener("load", onLoad);
    iframe.addEventListener("error", onFrameError);
    window.addEventListener("message", onMessage);

    return {
      dispose,
      reset: () => post({ action: "resetView" }),
      post,
      get frame() {
        return frame;
      }
    };
  }

  return {
    mount,
    post,
    dispose,
    reset: () => post({ action: "resetView" }),
    /** @deprecated use SCENE_MESSAGE_TYPE */
    messageType: SCENE_MESSAGE_TYPE
  };
}
