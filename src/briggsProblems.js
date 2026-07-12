import { attachVisualSpec } from "./briggsVisualSpecs.js";
import { GENERATED_BANK, QUESTIONS_PER_TOPIC } from "./generatedBank.js";

const BANK = GENERATED_BANK;

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
  },
  applications: {
    1: "Spring work (Hooke)",
    2: "Variable force work",
    3: "Pumping a rectangular tank",
    4: "Lifting a rope",
    5: "Distance from velocity",
    6: "Accumulated flow volume",
    7: "Energy from power",
    8: "Total profit change",
    9: "Work with a sqrt force",
    10: "Drug accumulation",
    11: "Walkway area difference",
    12: "Trapezoidal lot area",
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

export { QUESTIONS_PER_TOPIC };
