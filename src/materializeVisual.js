/**
 * Materialization — deep module: Problem → validated renderer-ready VisualSpec.
 *
 * Interface (callers + tests) — THE only Problem → VisualSpec seam:
 *   materializeVisualExample(problem, { alternate })
 *   materializeVisualSpec(problem, options)
 *   problemHasDualMethod(problem)
 *   validateVisualSpec(spec)
 *
 * Implementation (internal): attach maps / infer VisualParams / repair / legacy / resolve dual.
 * Bank rows must arrive without VisualSpec attached; attach happens only here.
 *
 * Do not call visualSpecs.resolveVisualSpec on bank rows from audits or Scene —
 * enter through this module so attach + repair always run.
 */

import { attachVisualSpec } from "./briggsVisualSpecs.js";
import {
  buildExampleFromSpec,
  buildLegacySpec,
  resolveVisualSpecFromAttached as resolveSpecRaw,
  problemHasDualMethod as dualMethodRaw,
  resolveOrientation
} from "./visualSpecs.js";
import { validateVisualSpecShape, SPEC_PROVENANCE } from "./visualSpecSchema.js";

/**
 * Ensure problem has visualSpec attached (maps / visualParams / repair).
 * Mutates a clone path — never the bank pool entry when called via materializeVisualExample.
 * @returns {{ problem: object|null, provenance: string }}
 */
export function ensureVisualSpec(problem) {
  if (!problem) return { problem: null, provenance: SPEC_PROVENANCE.NONE };
  if (problem.visualSpec) {
    return {
      problem,
      provenance: problem._specProvenance || SPEC_PROVENANCE.PREATTACHED
    };
  }
  const p = attachVisualSpec(problem);
  let provenance = p._specProvenance || SPEC_PROVENANCE.NONE;
  if (!p.visualSpec && (p.visual || p.given)) {
    p.visualSpec = buildLegacySpec(p);
    provenance = SPEC_PROVENANCE.LEGACY;
    p._specProvenance = provenance;
  }
  return { problem: p, provenance };
}

/**
 * Validate a serializable visualSpec. Returns { ok, errors[] }.
 */
export function validateVisualSpec(spec) {
  const base = validateVisualSpecShape(spec);
  if (!base.ok || !spec) return base;
  const errors = [...base.errors];
  const method = spec.method || "area";
  const orientation = resolveOrientation(method, spec.orientation);
  if (orientation === "vertical") {
    if (spec.xMin != null && spec.xMax != null && !(Number(spec.xMax) > Number(spec.xMin))) {
      if (!errors.some(e => e.includes("xMax"))) errors.push("xMax must be greater than xMin");
    }
  } else if (orientation === "horizontal") {
    if (spec.yMin != null && spec.yMax != null && !(Number(spec.yMax) > Number(spec.yMin))) {
      if (!errors.some(e => e.includes("yMax"))) errors.push("yMax must be greater than yMin");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Resolve alternate vs primary serializable spec (clone, no functions).
 * Requires attach first — public seam only for already-prepared rows.
 */
export function resolveVisualSpec(problem, { alternate = false } = {}) {
  const { problem: p } = ensureVisualSpec(problem);
  if (!p) return null;
  return resolveSpecRaw(p, { alternate });
}

export function problemHasDualMethod(problem) {
  if (!problem) return false;
  const { problem: p } = problem.visualSpec
    ? { problem }
    : ensureVisualSpec(structuredClone(problem));
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
 *   validation: { ok: boolean, errors: string[] },
 *   provenance: string
 * }}
 */
export function materializeVisualExample(problem, { alternate = false } = {}) {
  if (!problem) {
    return {
      problem: null,
      spec: null,
      example: null,
      dualMethod: false,
      validation: { ok: false, errors: ["no problem"] },
      provenance: SPEC_PROVENANCE.NONE
    };
  }
  // Drop session circular ref before clone (_prepared → prepared.problem → …).
  const { _prepared: _drop, ...serializable } = problem;
  const clone = structuredClone(serializable);
  const { problem: prepared, provenance } = ensureVisualSpec(clone);
  const spec = resolveSpecRaw(prepared, { alternate });
  const validation = validateVisualSpec(spec);
  return {
    problem: prepared,
    spec,
    example: spec ? buildExampleFromSpec(spec) : null,
    dualMethod: dualMethodRaw(prepared),
    validation,
    provenance
  };
}

/** Convenience: only the serializable spec the iframe needs. */
export function materializeVisualSpec(problem, options) {
  return materializeVisualExample(problem, options).spec;
}

export { SPEC_PROVENANCE };
