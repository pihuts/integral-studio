/**
 * Scene host — Practice-side adapter over SceneController.
 * Owns mount / dual-method hot-swap / loading chrome / validation gate.
 * Consumes PreparedProblem from session state — does not re-materialize.
 */

import { createSceneController } from "./sceneController.js";
import { state, maxStrips, prefersReducedMotion } from "./practiceState.js";
import { prepareProblem } from "./preparedProblem.js";

function vizPaletteFromCss() {
  const cs = getComputedStyle(document.documentElement);
  const get = name => cs.getPropertyValue(name).trim();
  // Fallbacks match cool product tokens in DESIGN.md / :root (not legacy cream paper)
  return {
    canvas: (get("--media-canvas") || "#e8eaee").replace("#", ""),
    region: get("--viz-region") || "#c4887a",
    shell: get("--viz-shell") || "#c4922e",
    solid: get("--viz-solid") || "#8a3a48",
    water: get("--viz-water") || "#1a5c48",
    ink: get("--viz-ink") || "#5e1f2e",
    line: get("--line") || "#e2e4e8",
    grid: get("--viz-grid") || get("--muted") || "#6e7682",
    muted: get("--muted") || "#5c6570",
    panel: get("--panel") || "#f5f6f8",
    red: get("--red") || "#9c1f2a",
    teal: get("--teal") || "#1a5c48",
    accent: get("--accent") || "#c4922e"
  };
}

/** Active iframe handle from createSceneController().mount */
let sceneHandle = null;
let sceneController = null;
let hooks = {
  onStep: null,
  onProgress: null,
  syncPlayButton: null
};

function currentPrepared(problem) {
  if (state.prepared?.problem === problem || (problem && state.prepared?.problem === state.problem)) {
    return state.prepared;
  }
  if (problem?._prepared) return problem._prepared;
  if (state.prepared) return state.prepared;
  return prepareProblem(problem || state.problem);
}

export function initSceneHost({ origin, onStep, onProgress, syncPlayButton, onSyncControls } = {}) {
  hooks = { onStep, onProgress, syncPlayButton, onSyncControls };
  sceneController = createSceneController({
    origin: origin || window.location.origin,
    getPalette: vizPaletteFromCss,
    onReady: () => hideVizLoading(),
    onError: message => showVizError(message),
    onStep: (step, text) => hooks.onStep?.(step, text),
    onProgress: (nextProgress, nextPlaying) => hooks.onProgress?.(nextProgress, nextPlaying),
    onSyncControls: () => {
      syncSceneControls();
      hooks.onSyncControls?.();
    }
  });
  return sceneController;
}

export function getSceneHandle() {
  return sceneHandle;
}

export function hideVizLoading() {
  state.vizLoading = false;
  state.vizError = null;
  const host = document.querySelector("#three-host");
  const loader = document.querySelector("#viz-loading");
  const errorEl = document.querySelector("#viz-error");
  if (host) {
    host.classList.remove("is-loading", "has-error");
    host.setAttribute("aria-busy", "false");
  }
  if (loader) loader.setAttribute("aria-hidden", "true");
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.setAttribute("aria-hidden", "true");
  }
}

export function showVizError(message) {
  state.vizLoading = false;
  state.vizError = message || "Couldn't load the visualization.";
  const host = document.querySelector("#three-host");
  const loader = document.querySelector("#viz-loading");
  const errorEl = document.querySelector("#viz-error");
  const errorText = errorEl?.querySelector(".viz-error-text");
  if (host) {
    host.classList.remove("is-loading");
    host.classList.add("has-error");
    host.setAttribute("aria-busy", "false");
  }
  if (loader) loader.setAttribute("aria-hidden", "true");
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.setAttribute("aria-hidden", "false");
    if (errorText) errorText.textContent = state.vizError;
  }
}

export function syncSceneControls() {
  if (prefersReducedMotion()) state.playing = false;
  sceneHandle?.post({ action: "setPalette", palette: vizPaletteFromCss() });
  sceneHandle?.post({ action: "setShells", value: state.slices });
  sceneHandle?.post({ action: "setSpeed", value: state.playbackSpeed });
  sceneHandle?.post({ action: "setProgress", value: state.playbackProgress });
  if (state.playing) sceneHandle?.post({ action: "play" });
  else sceneHandle?.post({ action: "pause" });
  hooks.syncPlayButton?.();
}

function ensureLoadingChrome(host) {
  let loader = host.querySelector("#viz-loading");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "viz-loading";
    loader.className = "viz-loading";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.innerHTML =
      '<span class="viz-loading-bar" aria-hidden="true"></span><span class="viz-loading-text">Loading visualization…</span>';
    host.prepend(loader);
  }
  loader.setAttribute("aria-hidden", "false");
  let errorEl = host.querySelector("#viz-error");
  if (!errorEl) {
    errorEl = document.createElement("div");
    errorEl.id = "viz-error";
    errorEl.className = "viz-error";
    errorEl.setAttribute("role", "alert");
    errorEl.innerHTML =
      '<p class="viz-error-text">Couldn\'t load the visualization.</p><button type="button" id="viz-retry" class="secondary control-btn">Try again</button>';
    host.append(errorEl);
    errorEl.querySelector("#viz-retry")?.addEventListener("click", () => {
      if (state.problem) mountScene(state.problem);
    });
  }
  errorEl.hidden = true;
  errorEl.setAttribute("aria-hidden", "true");
}

/**
 * Mount Scene for a Problem using session PreparedProblem (no re-materialize).
 */
export function mountScene(problem) {
  sceneHandle?.dispose();
  sceneHandle = null;
  const host = document.querySelector("#three-host");
  if (!host || !sceneController) return;
  state.animationStep = "region";
  state.animationStepText = "Sketch the bounded region.";
  state.vizLoading = true;
  state.vizError = null;
  state.slices = Math.min(state.slices, maxStrips());
  host.classList.add("is-loading");
  host.classList.remove("has-error");
  host.setAttribute("aria-busy", "true");
  host.querySelector(".legacy-animation")?.remove();
  ensureLoadingChrome(host);

  const prepared = currentPrepared(problem);
  const spec = prepared.spec(state.alternate);
  const validation = prepared.validation(state.alternate);
  if (!spec || !validation.ok) {
    const detail = validation.errors?.join("; ") || "missing VisualSpec";
    showVizError(`Couldn't build the visualization (${detail}).`);
    return;
  }

  const palette = vizPaletteFromCss();
  const canvasColor = palette.canvas || "ede6d8";
  const vizLabel = prepared.visualLabel(state.alternate);

  sceneHandle = sceneController.mount(host, {
    visualSpec: spec,
    alternate: state.alternate,
    shells: state.slices,
    speed: state.playbackSpeed,
    title: vizLabel,
    canvasColor,
    palette
  });
}

/**
 * Dual method toggle: hot-swap VisualSpec when iframe is live; remount otherwise.
 */
export function applyDualMethodVisual(problem) {
  const prepared = currentPrepared(problem);
  const spec = prepared.spec(state.alternate);
  const validation = prepared.validation(state.alternate);
  if (!spec || !validation.ok) {
    const detail = validation.errors?.join("; ") || "missing VisualSpec";
    showVizError(`Couldn't build the visualization (${detail}).`);
    return;
  }
  const live = document.querySelector(".legacy-animation");
  if (live && sceneHandle) {
    state.vizLoading = true;
    state.vizError = null;
    const host = document.querySelector("#three-host");
    const errorEl = document.querySelector("#viz-error");
    host?.classList.add("is-loading");
    host?.classList.remove("has-error");
    host?.setAttribute("aria-busy", "true");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.setAttribute("aria-hidden", "true");
    }
    sceneController.setExample(spec);
    syncSceneControls();
  } else {
    mountScene(problem);
  }
}

export { vizPaletteFromCss };
