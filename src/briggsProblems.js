import { attachVisualSpec } from "./briggsVisualSpecs.js";

let BANK = {};
let bankPromise;

export const QUESTIONS_PER_TOPIC = 50;

/** Load the large generated bank only when practice is actually opened. */
export function loadBriggsBank() {
  if (!bankPromise) {
    bankPromise = import("./generatedBank.js")
      .then(({ GENERATED_BANK }) => {
        BANK = GENERATED_BANK;
        return BANK;
      })
      .catch(error => {
        // Let the UI retry after a transient chunk/network failure.
        bankPromise = null;
        throw error;
      });
  }
  return bankPromise;
}
/**
 * Strict Calc-1/2 bans — scan the whole problem (prompt, steps, equations, …).
 *
 * Double integration:
 *  - prose "double integral", \iint/\iiint, iterated \int…\int, \,dy\,dx
 *  - does NOT flag sums of separate single integrals (A=∫…+∫…)
 *
 * Hyperbolic functions:
 *  - sinh/cosh/tanh/… and inverses (asinh, \sinh^{-1}, …)
 */
function isBannedProblem(problem) {
  const text = JSON.stringify(problem ?? {});
  if (/double\s+integral/i.test(text)) return true;
  if (/\\iiint|\\iint|\\iiiint/.test(text)) return true;
  if (/\\int\s*\\int/.test(text)) return true;
  if (/\\,d[xy]\\,d[xy]/.test(text)) return true;
  if (/\\int(?:_(?:\{[^}]*\}|[^\s\\^])|\\?\^(?:\{[^}]*\}|[^\s\\_]))+\\int/.test(text)) {
    return true;
  }
  if (/hyperbolic/i.test(text)) return true;
  if (/\\sinh|\\cosh|\\tanh|\\coth|\\sech|\\csch/.test(text)) return true;
  if (/\\operatorname\{a?(?:sinh|cosh|tanh|coth|sech|csch)\}/.test(text)) return true;
  if (/(?<![A-Za-z])a?(?:sinh|cosh|tanh|coth|sech|csch)(?![A-Za-z])/i.test(text)) return true;
  if (/"t"\s*:\s*"(?:cosh|sinh)"/.test(text)) return true;
  return false;
}

function dedupePool(items) {
  const seen = new Set();
  const pool = [];
  for (const item of items.filter((problem) => !isBannedProblem(problem))) {
    const key = `${item.source || ""}|${item.prompt || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(item);
  }
  return pool;
}

/** Prefer descriptive concept titles when the bank only has a generic topic label. */
const CONCEPT_TITLES = {
  fundamentals: {
    1: "Power-rule antiderivative",
    2: "Term-by-term antiderivative",
    3: "Trigonometric antiderivative",
    4: "Exponential and logarithmic antiderivative",
    5: "Recognize a simple substitution",
    6: "Inverse-trig pattern",
    7: "Arctangent pattern",
    8: "Initial value antiderivative",
    9: "Motion from acceleration",
    10: "Fundamental Theorem evaluation",
  },
  area: {
    1: "Area under a polynomial",
    2: "Area under a parabola arch",
    3: "Enclosed area: parabola and line",
    4: "Enclosed area: line and parabola",
    5: "Symmetric total area",
    6: "Area with trigonometric integrand",
    7: "Area between curves on an interval",
    8: "Area under a root function",
    9: "Area under a reciprocal/rational",
    10: "Piecewise lower boundary",
    11: "Horizontal strips: parabola and vertical line",
    12: "Horizontal strips: parabola and line",
  },
  volumes: {
    1: "Disk method: curve about x-axis",
    2: "Disk method about a horizontal line",
    3: "Washer method between two curves",
    4: "Shell method about y-axis",
    5: "Shell method about a vertical line",
    6: "Square cross sections on a curved base",
    7: "Semicircle cross sections",
    8: "Disk about y = h with sqrt radius",
    9: "Shells for region between curves",
    10: "Disk with square-root radius",
    11: "Horizontal disks about y-axis (x = g(y))",
    12: "Horizontal shells about x-axis",
  },
  centroids: {
    1: "Rectangle centroid",
    2: "Right-triangle centroid (standard)",
    3: "Right-triangle centroid (shifted)",
    4: "Parabolic region centroid",
    5: "Sqrt region centroid",
    6: "Composite L-shape centroid",
    7: "Centroid x-bar only",
    8: "Centroid y-bar only",
    9: "Centroid with sine top",
    10: "Centroid with exponential top",
    11: "Semicircular lamina",
    12: "Quarter-circular lamina",
    13: "Trapezoidal lamina",
    14: "Horizontal-strip centroid",
  },
  arc: {
    1: "Arc length of a line",
    2: "Arc length of y = (2/3)x^{3/2}",
    3: "Arc length of a parabola",
    4: "Arc length of a circular arc",
    5: "Arc length of y = ln x",
    6: "Arc length of an exponential",
    7: "Arc length of a shifted power curve",
    8: "Arc length of a classic special curve",
    9: "Polyline arc length",
    10: "Arc length of y = √x",
  },
  surface: {
    1: "Surface of a line (cone frustum)",
    2: "Spherical band surface",
    3: "Surface of a power curve",
    4: "Surface of a square-root curve",
    5: "Surface of an exponential",
    6: "Cylinder surface (constant y)",
    7: "Surface about a parallel line",
    8: "Surface of a parabola",
    9: "Surface of a shifted power curve",
    10: "Surface of y = √(c − x)",
    11: "y = mx about the y-axis",
    12: "x = g(y) about the x-axis",
  },
  inertia: {
    1: "I_x of a rectangle",
    2: "I_y of a rectangle",
    3: "Polar moment of a rectangle",
    4: "I_x of a triangle",
    5: "I_y of a triangle",
    6: "I_x under a parabola",
    7: "I_y under a parabola",
    8: "Centroidal I for a triangle",
    9: "Second moment about y = −d",
    10: "Second moment about x = d",
    11: "I_x of a semicircle",
    12: "I_x of a quarter circle",
    13: "I_x of a trapezoid",
    14: "I_y of a trapezoid",
    15: "I_y with horizontal strips",
    16: "I_x with horizontal strips",
  },
  applications: {
    1: "Spring from natural length",
    2: "Spring already stretched",
    3: "Compress a spring",
    4: "Spring between two stretches",
    5: "Linear variable force",
    6: "Quadratic force work",
    7: "Sqrt force work",
    8: "Exponential force work",
    9: "Sinusoidal force work",
    10: "Piecewise force work",
    11: "Pump rectangular tank to top",
    12: "Pump rectangular tank to spout",
    13: "Pump cylindrical tank",
    14: "Pump triangular trough",
    15: "Pump top half of tank",
    16: "Pump with y measured from top",
    17: "Pump hemispherical bowl",
    18: "Pump partially filled tall tank",
    19: "Lift entire rope",
    20: "Lift part of a rope",
    21: "Chain with end weight",
    22: "Cable from ground to roof",
    23: "Half chain hanging off table",
    24: "Distance from linear velocity",
    25: "Distance from quadratic velocity",
    26: "Distance from sinusoidal velocity",
    27: "Accumulated flow (linear rate)",
    28: "Accumulated flow (exponential)",
    29: "Energy from power (quadratic)",
    30: "Energy from power (poly)",
    31: "Total profit change",
    32: "Drug accumulation",
    33: "Walkway area difference",
    34: "Trapezoidal lot area",
    35: "Infusion accumulation",
    36: "Net change from rate",
    37: "Reciprocal force work",
    38: "Leaking sandbag lift",
    39: "Inverse-square force work",
    40: "Preloaded spring work",
  },
};

const GENERIC_TITLES = new Set([
  "Area",
  "Volume",
  "Centroid",
  "Arc length",
  "Surface area",
  "Moment of inertia",
  "Applications",
  "Antiderivative",
]);

function conceptNumber(problem) {
  const match = (problem.source || "").match(/concept\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function withConceptTitle(problem, topic) {
  const n = conceptNumber(problem);
  const map = CONCEPT_TITLES[topic];
  if (!n || !map?.[n]) return problem;
  if (!problem.title || GENERIC_TITLES.has(problem.title)) {
    problem.title = map[n];
  }
  return problem;
}

function poolFor(topic) {
  const topicBank = BANK[topic];
  if (!topicBank) return [];
  const pool = Array.isArray(topicBank)
    ? topicBank
    : [...(topicBank.easy || []), ...(topicBank.medium || []), ...(topicBank.hard || [])];
  return dedupePool(pool).slice(0, QUESTIONS_PER_TOPIC);
}

export function getBriggsProblem(topic, _difficulty, questionIndex) {
  const pool = poolFor(topic);
  if (!pool.length || questionIndex >= pool.length) return null;
  const problem = structuredClone(pool[questionIndex]);
  withConceptTitle(problem, topic);
  if (!problem.correctId) {
    problem.correctId = problem.choices?.find((choice) => choice.label === "Correct")?.id || "a";
  }
  return attachVisualSpec(problem);
}

export function briggsProblemCount(topic, _difficulty) {
  return poolFor(topic).length;
}

/** Distinct concept labels available in the current pool (for UI / audits). */
export function conceptCoverage(topic) {
  const pool = poolFor(topic);
  const concepts = new Set();
  for (const p of pool) {
    const n = conceptNumber(p);
    if (n != null) concepts.add(n);
  }
  return {
    total: pool.length,
    concepts: [...concepts].sort((a, b) => a - b),
    conceptCount: concepts.size,
  };
}
