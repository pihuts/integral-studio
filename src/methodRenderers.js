/**
 * Method-renderer policy — deep surface for Animation timeline × Render method.
 * Geometry adapters live in original-shell.js; they must obey framePolicy / stackPieceKind.
 */

import { PHASE, phasesFromProgress, stepIdFromProgress } from "./animationTimeline.js";

export function isAreaStripMethod(method) {
  return method === "area" || method === "centroid" || method === "inertia";
}

export function isShellMethod(method) {
  return typeof method === "string" && method.startsWith("shell");
}

export function isDiskOrWasher(method) {
  return ["disk-x", "disk-y", "washer-x", "washer-y"].includes(method);
}

export function isCrossSection(method) {
  return typeof method === "string" && method.startsWith("cross-");
}

export function isSurfaceMethod(method) {
  return method === "surface-x" || method === "surface-y";
}

/**
 * Family id for dispatch. Kernel switches on family; adapters implement geometry.
 */
export function methodFamily(method) {
  if (method === "goat-barn") return "goat-barn";
  if (method === "pool-fill") return "pool-fill";
  if (method === "pump-bowl") return "pump-bowl";
  if (method === "arc") return "arc";
  if (isSurfaceMethod(method)) return "surface";
  if (isCrossSection(method)) return "cross";
  if (isAreaStripMethod(method)) return "area-strip";
  if (isShellMethod(method)) return "shell";
  if (isDiskOrWasher(method)) return "disk-washer";
  return "disk-washer";
}

/**
 * Which stack-geometry adapter rebuildCompletedShells / rotate samples should use.
 * Kernel must switch on this — not ad-hoc string startsWith.
 */
export function stackPieceKind(method) {
  const family = methodFamily(method);
  if (family === "pump-bowl") return "pump-bowl";
  if (family === "pool-fill") return "pool-fill";
  if (family === "arc") return "arc";
  if (family === "area-strip") return "slice";
  if (family === "cross") return "cross";
  if (family === "shell") return "shell";
  if (family === "surface") return method === "surface-y" ? "surface-y" : "surface-x";
  if (family === "goat-barn") return "goat-barn";
  return "disk-washer";
}

/** Piece name for legend / narration (not step track). */
export function pieceLabel(method) {
  if (isShellMethod(method)) return "shell";
  if (method?.startsWith("disk")) return "disk";
  if (method === "arc") return "hypotenuse segment";
  if (isSurfaceMethod(method)) return "surface band";
  if (method === "pump-bowl" || method === "pool-fill") return "water slice";
  if (method === "goat-barn") return "sector";
  if (isCrossSection(method)) return "cross-section";
  if (isAreaStripMethod(method)) return "strip";
  return "washer";
}

/**
 * Timeline policy for a method family — when to show slice / rotating sample / stack.
 */
export function rendererPolicy(method) {
  const family = methodFamily(method);
  const base = {
    family,
    ...phasesFromProgress(0),
    showSampleBelow: PHASE.sampleHide,
    showRotateFrom: PHASE.midShellStart,
    showRotateUntil: PHASE.midShellEnd,
    earlyReturn: family === "goat-barn" || family === "pool-fill",
    goatStage(progress) {
      if (progress < 0.43) return 1;
      if (progress < 0.72) return 2;
      return 3;
    }
  };
  return base;
}

/**
 * Full frame policy for a progress value — kernel reads this instead of raw constants.
 */
export function framePolicy(method, progress) {
  const phases = phasesFromProgress(progress);
  const policy = rendererPolicy(method);
  const p = phases.progress;
  return {
    ...policy,
    ...phases,
    stepId: stepIdFromProgress(p),
    pieceKind: stackPieceKind(method),
    goatStage: policy.goatStage(p),
    showSlice: p < policy.showSampleBelow && method !== "arc",
    showRotateSample: p >= policy.showRotateFrom && p < policy.showRotateUntil,
    shellAngle: 0.02 + phases.rotatePhase * Math.PI * 2,
    regionOpacity: p > PHASE.regionFade ? 0.2 : 0.55
  };
}

export { PHASE, phasesFromProgress, stepIdFromProgress };
