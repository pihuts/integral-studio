/**
 * PreparedProblem — session-local view of a Problem after Materialization.
 *
 * Interface (callers + tests):
 *   prepareProblem(problem) → PreparedProblem
 *   prepared.spec(alternate) / .validation(alternate) / .example(alternate)
 *   prepared.visualLabel(alternate)
 *
 * Callers never re-attach VisualSpec; Dual method toggle only selects primary vs alternate.
 */

import { materializeVisualExample } from "./materializeVisual.js";

/**
 * @typedef {object} PreparedBranch
 * @property {object|null} spec
 * @property {{ ok: boolean, errors: string[] }} validation
 * @property {object|null} example
 * @property {string} provenance
 */

/**
 * @typedef {object} PreparedProblem
 * @property {object} problem — bank row with visualSpec attached (safe to mutate for UI only)
 * @property {boolean} dualMethod
 * @property {PreparedBranch} primary
 * @property {PreparedBranch|null} alternate
 * @property {(alternate?: boolean) => object|null} spec
 * @property {(alternate?: boolean) => { ok: boolean, errors: string[] }} validation
 * @property {(alternate?: boolean) => object|null} example
 * @property {(alternate?: boolean) => string} visualLabel
 * @property {(alternate?: boolean) => string|undefined} method
 */

/**
 * Materialize once for primary (and alternate when Dual method exists).
 * @param {object} problem
 * @returns {PreparedProblem}
 */
export function prepareProblem(problem) {
  if (!problem) {
    const emptyValidation = { ok: false, errors: ["no problem"] };
    const emptyBranch = {
      spec: null,
      validation: emptyValidation,
      example: null,
      provenance: "none"
    };
    return makePrepared(null, emptyBranch, null, false);
  }

  const primaryMat = materializeVisualExample(problem, { alternate: false });
  const preparedProblem = primaryMat.problem || problem;
  const dualMethod = Boolean(primaryMat.dualMethod);
  const primary = {
    spec: primaryMat.spec,
    validation: primaryMat.validation,
    example: primaryMat.example,
    provenance: primaryMat.provenance || "none"
  };

  let alternate = null;
  if (dualMethod) {
    const altMat = materializeVisualExample(preparedProblem, { alternate: true });
    alternate = {
      spec: altMat.spec,
      validation: altMat.validation,
      example: altMat.example,
      provenance: altMat.provenance || primary.provenance
    };
  }

  return makePrepared(preparedProblem, primary, alternate, dualMethod);
}

function makePrepared(problem, primary, alternate, dualMethod) {
  const branch = alt => (alt && alternate ? alternate : primary);

  const prepared = {
    problem,
    dualMethod,
    primary,
    alternate,
    spec(alt = false) {
      return branch(alt).spec;
    },
    validation(alt = false) {
      return branch(alt).validation;
    },
    example(alt = false) {
      return branch(alt).example;
    },
    method(alt = false) {
      return branch(alt).spec?.method;
    },
    visualLabel(alt = false) {
      if (dualMethod) return alt ? "Horizontal strips" : "Vertical strips";
      const spec = branch(alt).spec;
      if (spec?.title) return spec.title;
      const type = problem?.visual;
      return (
        {
          area: "Area slices",
          volume: alt ? "Disks & washers" : "Shells",
          centroid: "Centroid",
          curve: "Arc length",
          surface: "Surface bands",
          inertia: "Axis distance"
        }[type] || "Visual"
      );
    }
  };
  if (problem) {
    problem.dualMethod = dualMethod;
    problem._prepared = prepared;
  }
  return prepared;
}

/** True when prepared has a Dual method alternate branch. */
export function preparedHasDualMethod(prepared) {
  return Boolean(prepared?.dualMethod);
}
