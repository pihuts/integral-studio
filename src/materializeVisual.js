/**
 * Single VisualSpec materialization path: problem → validated renderer-ready spec.
 * Callers and tests use this interface; maps / infer / repair stay inside.
 */

import { attachVisualSpec } from "./briggsVisualSpecs.js";
import {
  buildExampleFromSpec,
  buildLegacySpec,
  resolveVisualSpec as resolveSpecRaw,
  problemHasDualMethod as dualMethodRaw,
  SUPPORTED_CURVE_TYPES,
  SUPPORTED_RENDER_METHODS
} from "./visualSpecs.js";

const CURVE_TYPES = new Set(SUPPORTED_CURVE_TYPES);
const RENDER_METHODS = new Set(SUPPORTED_RENDER_METHODS);

/**
 * Ensure problem has visualSpec attached (maps / visualParams / repair).
 * Mutates a clone — never the bank pool entry.
 */
export function ensureVisualSpec(problem) {
  if (!problem) return null;
  const p = problem.visualSpec ? problem : attachVisualSpec(structuredClone(problem));
  if (!p.visualSpec && (p.visual || p.given)) {
    p.visualSpec = buildLegacySpec(p);
  }
  return p;
}

/**
 * Validate a serializable visualSpec. Returns { ok, errors[] }.
 * Generator-owned specs should pass; runtime repair is a last resort before this.
 */
export function validateVisualSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    return { ok: false, errors: ["missing visualSpec"] };
  }
  const method = spec.method || "area";
  if (!RENDER_METHODS.has(method) && method !== "volume") {
    errors.push(`unsupported method: ${method}`);
  }
  const curves = [spec.top, spec.bottom, spec.left, spec.right].filter(Boolean);
  for (const c of curves) {
    if (c.t && !CURVE_TYPES.has(c.t)) {
      errors.push(`unsupported curve type: ${c.t}`);
    }
  }
  const orientation = spec.orientation || "vertical";
  if (orientation === "vertical") {
    if (spec.xMin == null || spec.xMax == null) {
      // soft: many hand maps set bounds later
    } else if (!(Number(spec.xMax) > Number(spec.xMin))) {
      errors.push("xMax must be greater than xMin");
    }
  } else if (orientation === "horizontal") {
    if (spec.yMin != null && spec.yMax != null && !(Number(spec.yMax) > Number(spec.yMin))) {
      errors.push("yMax must be greater than yMin");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Resolve alternate vs primary serializable spec (clone, no functions).
 */
export function resolveVisualSpec(problem, { alternate = false } = {}) {
  const p = ensureVisualSpec(problem);
  if (!p) return null;
  return resolveSpecRaw(p, { alternate });
}

export function problemHasDualMethod(problem) {
  const p = problem?.visualSpec ? problem : ensureVisualSpec(problem);
  return dualMethodRaw(p || problem);
}

/**
 * Deep interface: problem (+ alternate) → materialised visual for UI + iframe.
 *
 * @returns {{
 *   problem: object,
 *   spec: object|null,
 *   example: object|null,
 *   dualMethod: boolean,
 *   validation: { ok: boolean, errors: string[] }
 * }}
 */
export function materializeVisualExample(problem, { alternate = false } = {}) {
  if (!problem) {
    return {
      problem: null,
      spec: null,
      example: null,
      dualMethod: false,
      validation: { ok: false, errors: ["no problem"] }
    };
  }
  const prepared = ensureVisualSpec(structuredClone(problem));
  const spec = resolveSpecRaw(prepared, { alternate });
  const validation = validateVisualSpec(spec);
  const example = spec ? buildExampleFromSpec(spec) : null;
  return {
    problem: prepared,
    spec,
    example,
    dualMethod: dualMethodRaw(prepared),
    validation
  };
}

/** Convenience: only the serializable spec the iframe needs. */
export function materializeVisualSpec(problem, options) {
  return materializeVisualExample(problem, options).spec;
}
