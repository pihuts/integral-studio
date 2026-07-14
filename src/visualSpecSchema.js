/**
 * Shared VisualSpec schema — single source of truth for supported methods / curves.
 * Generator, Materialization, and audits should all consult this module.
 */

export const SUPPORTED_CURVE_TYPES = Object.freeze([
  "c",
  "lin",
  "pow",
  "pow-shift",
  "sqrt",
  "poly",
  "rat",
  "samples",
  "piecewise",
  "exp",
  "quad",
  "sin",
  "cos",
  "cosh",
  "sinh",
  "cos2",
  "sqrt-shift",
  "sub-u-power",
  "inv-sqrt-minus-recip",
  "sec2",
  "csc2",
  "sec-tan",
  "lin-cos",
  "lin-sin",
  "trig-combo",
  "exp-plus-recip",
  "exp-lin-recip",
  "sub-u-gen",
  "sub-u-linear",
  "pow-sqrt",
  "log",
  "recip",
  "recip-quad",
  "inv-sqrt-unit",
  "inv-sqrt",
  "neg-log",
  "sqrt-inv",
  "sqrt-inv-cap",
  "inv-quad-hi",
  "inv-quad-lo",
  "circle-half-y",
  "circle-upper"
]);

export const SUPPORTED_RENDER_METHODS = Object.freeze([
  "area",
  "centroid",
  "inertia",
  "arc",
  "surface-x",
  "surface-y",
  "pump-bowl",
  "pool-fill",
  "goat-barn",
  "cross-square",
  "cross-semicircle",
  "shell-x",
  "shell-y",
  "disk-x",
  "disk-y",
  "washer-x",
  "washer-y"
]);

const CURVE_SET = new Set(SUPPORTED_CURVE_TYPES);
const METHOD_SET = new Set(SUPPORTED_RENDER_METHODS);

/** Provenance tags for how a VisualSpec was obtained. */
export const SPEC_PROVENANCE = Object.freeze({
  MAP_KEY: "map-key",
  MAP_SOURCE: "map-source",
  VISUAL_PARAMS: "visual-params",
  REPAIR: "repair",
  LEGACY: "legacy",
  PREATTACHED: "preattached",
  NONE: "none"
});

/**
 * Structural validation of a serializable VisualSpec.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateVisualSpecShape(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    return { ok: false, errors: ["missing visualSpec"] };
  }
  const method = spec.method || "area";
  if (!METHOD_SET.has(method) && method !== "volume") {
    errors.push(`unsupported method: ${method}`);
  }
  const curves = [spec.top, spec.bottom, spec.left, spec.right].filter(Boolean);
  for (const c of curves) {
    if (c.t && !CURVE_SET.has(c.t)) {
      errors.push(`unsupported curve type: ${c.t}`);
    }
  }
  if (spec.xMin != null && spec.xMax != null && !(Number(spec.xMax) > Number(spec.xMin))) {
    errors.push("xMax must be greater than xMin");
  }
  if (spec.yMin != null && spec.yMax != null && !(Number(spec.yMax) > Number(spec.yMin))) {
    errors.push("yMax must be greater than yMin");
  }
  return { ok: errors.length === 0, errors };
}

export function isSupportedMethod(method) {
  return METHOD_SET.has(method) || method === "volume";
}

export function isSupportedCurveType(t) {
  return CURVE_SET.has(t);
}
