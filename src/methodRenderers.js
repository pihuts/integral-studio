/**
 * Method-renderer registry — pure classification + phase policy for the 3D kernel.
 * Geometry adapters live in original-shell.js; this module owns the deep policy surface.
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
    earlyReturn: family === "goat-barn" || family === "pool-fill"
  };
  if (family === "goat-barn") {
    return {
      ...base,
      goatStage(progress) {
        if (progress < 0.43) return 1;
        if (progress < 0.72) return 2;
        return 3;
      }
    };
  }
  return base;
}

/**
 * Full frame policy for a progress value — kernel reads this instead of raw constants.
 */
export function framePolicy(method, progress) {
  const phases = phasesFromProgress(progress);
  const policy = rendererPolicy(method);
  return {
    ...policy,
    ...phases,
    stepId: stepIdFromProgress(progress),
    showSlice: progress < policy.showSampleBelow && method !== "arc",
    showRotateSample: progress >= policy.showRotateFrom && progress < policy.showRotateUntil,
    shellAngle: 0.02 + phases.rotatePhase * Math.PI * 2,
    regionOpacity: progress > PHASE.regionFade ? 0.2 : 0.55
  };
}

export { PHASE, phasesFromProgress, stepIdFromProgress };
