/**
 * Shared animation timeline for parent UI and iframe renderer.
 * One module owns phase thresholds + step labels — no mirrored constants.
 */

/** Progress markers at the start of each named step. */
export const STEP_PROGRESS = Object.freeze({
  region: 0,
  slice: 0.24,
  rotate: 0.43,
  stack: 0.72
});

export const STEP_IDS = Object.freeze(["region", "slice", "rotate", "stack"]);

/** Phase end / width helpers used by the 3D kernel. */
export const PHASE = Object.freeze({
  sliceEnd: 0.28,
  rotateStart: STEP_PROGRESS.slice,
  rotateSpan: 0.42,
  stackStart: STEP_PROGRESS.stack,
  stackSpan: 0.28,
  midShellStart: 0.2,
  midShellEnd: 0.7,
  sampleHide: 0.52,
  regionFade: 0.74
});

/**
 * Derive continuous phase scalars and the active step id from [0,1] progress.
 */
export function phasesFromProgress(progress) {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return {
    progress: p,
    slicePhase: Math.min(1, Math.max(0, p / PHASE.sliceEnd)),
    rotatePhase: Math.min(1, Math.max(0, (p - PHASE.rotateStart) / PHASE.rotateSpan)),
    stackPhase: Math.min(1, Math.max(0, (p - PHASE.stackStart) / PHASE.stackSpan)),
    stepId: stepIdFromProgress(p)
  };
}

export function stepIdFromProgress(progress) {
  const p = Number.isFinite(progress) ? progress : 0;
  if (p < STEP_PROGRESS.slice) return "region";
  if (p < STEP_PROGRESS.rotate) return "slice";
  if (p < STEP_PROGRESS.stack) return "rotate";
  return "stack";
}

/** Default four-step labels; method-specific overrides below. */
const DEFAULT_STEPS = Object.freeze([
  { id: "region", label: "Region" },
  { id: "slice", label: "Slice" },
  { id: "rotate", label: "Rotate" },
  { id: "stack", label: "Stack" }
]);

const METHOD_STEP_LABELS = Object.freeze({
  arc: [
    { id: "region", label: "Curve" },
    { id: "slice", label: "Points" },
    { id: "rotate", label: "Segments" },
    { id: "stack", label: "Sum" }
  ],
  "pump-bowl": [
    { id: "region", label: "Bowl" },
    { id: "slice", label: "Slice" },
    { id: "rotate", label: "Lift" },
    { id: "stack", label: "Work" }
  ],
  "pool-fill": [
    { id: "region", label: "Pool" },
    { id: "slice", label: "Slice" },
    { id: "rotate", label: "Volume" },
    { id: "stack", label: "Fill" }
  ],
  "goat-barn": [
    { id: "region", label: "Barn" },
    { id: "slice", label: "Sector" },
    { id: "rotate", label: "Wrap" },
    { id: "stack", label: "Area" }
  ],
  "surface-x": [
    { id: "region", label: "Region" },
    { id: "slice", label: "Slice" },
    { id: "rotate", label: "Band" },
    { id: "stack", label: "Surface" }
  ],
  "surface-y": [
    { id: "region", label: "Region" },
    { id: "slice", label: "Slice" },
    { id: "rotate", label: "Band" },
    { id: "stack", label: "Surface" }
  ],
  centroid: [
    { id: "region", label: "Region" },
    { id: "slice", label: "Strip" },
    { id: "rotate", label: "Moment" },
    { id: "stack", label: "Balance" }
  ],
  area: [
    { id: "region", label: "Region" },
    { id: "slice", label: "Strip" },
    { id: "rotate", label: "dA" },
    { id: "stack", label: "Sum" }
  ],
  inertia: [
    { id: "region", label: "Region" },
    { id: "slice", label: "Strip" },
    { id: "rotate", label: "dA" },
    { id: "stack", label: "Sum" }
  ]
});

/**
 * Step track labels for a render method (and optional problem.visual fallback).
 */
export function animationStepsForMethod(method, visualHint) {
  const m = method || visualHint || "area";
  if (METHOD_STEP_LABELS[m]) return METHOD_STEP_LABELS[m].map(s => ({ ...s }));
  if (visualHint === "centroid") return METHOD_STEP_LABELS.centroid.map(s => ({ ...s }));
  if (visualHint === "area" || visualHint === "inertia") {
    return METHOD_STEP_LABELS.area.map(s => ({ ...s }));
  }
  return DEFAULT_STEPS.map(s => ({ ...s }));
}
