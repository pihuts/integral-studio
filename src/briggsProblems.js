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
    11: "Expand then integrate",
    12: "Constant-multiple rule",
    13: "Negative-power antiderivative",
    14: "Root / fractional powers",
    15: "Linear composition substitution",
    16: "Secant–tangent forms",
    17: "Average value of a function",
    18: "Position from velocity",
    19: "Net change theorem",
    20: "Even/odd definite integral",
    21: "Recognize chain-rule reverse",
    22: "Mixed elementary sum",
    23: "Definite exponential integral",
    24: "Arcsecant-type integrand",
    25: "Rewrite rational before integrating",
    26: "Accumulation / FTC net change",
    27: "Definite trigonometric integral",
    28: "Substitution under a square root",
    29: "Power-plus-trig mix",
    30: "Displacement from velocity",
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
    13: "Geometric area with sign changes",
    14: "Signed vs geometric area comparison",
    15: "Area under an exponential",
    16: "Area under cosine",
    17: "Enclosed area: cubic and line",
    18: "Area under a constant (rectangle)",
    19: "Area under absolute value",
    20: "Area under ln x",
    21: "Area between e^x and a line",
    22: "Triangle area via integral",
    23: "Area between two lines",
    24: "Area under 1/√x",
    25: "Horizontal strips: line and vertical",
    26: "Area under shifted parabola",
    27: "Area between sin and cos",
    28: "Area between constant and parabola",
    29: "Area on a negative-x interval",
    30: "Average height from area",
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
    13: "Washer about a horizontal line",
    14: "Cone/frustum from a line (disks)",
    15: "Equilateral triangle cross sections",
    16: "Shell under square-root about y-axis",
    17: "Disk of exponential about x-axis",
    18: "Rectangular cross sections",
    19: "Shell about x = a (far axis)",
    20: "Horizontal washers about y-axis",
    21: "Isosceles right triangle cross sections",
    22: "Horizontal disks: linear x = g(y)",
    23: "Shell under a line about y-axis",
    24: "Washer with constant outer radius",
    25: "Semicircle cross sections on parabola base",
    26: "Shell under sine about y-axis",
    27: "Disk of 1/x about x-axis",
    28: "Pyramid: tapering square sections",
    29: "Shell about x = −1",
    30: "Horizontal washers: y = x² and x = 1",
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
    15: "Centroid under y = h + x²",
    16: "Centroid under cosine top",
    17: "Centroid under reciprocal top",
    18: "Two-rectangle composite centroid",
    19: "Centroid under √(b − x)",
    20: "Centroid under h + cos x",
    21: "Parabola x-bar only",
    22: "Parabola y-bar only",
    23: "Centroid under decaying exponential",
    24: "Rising right-triangle centroid",
    25: "Horizontal strips: linear right edge",
    26: "Centroid under log top",
    27: "Centroid under downward parabola arch",
    28: "Centroid under shifted square root",
    29: "Shifted rectangle centroid",
    30: "Centroid between two curves",
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
    11: "Horizontal arc length x = (2/3)y^{3/2}",
    12: "Horizontal arc length of a line",
    13: "Arc length of scaled x^{3/2}",
    14: "Arc length of y = x²/4",
    15: "Arc length of y = e^{x/2}",
    16: "Horizontal arc length of a parabola",
    17: "Two-segment polyline path",
    18: "Arc length of x³/3 + 1/(4x)",
    19: "Partial circular arc",
    20: "Arc length of y = 2√x",
    21: "Horizontal line segment length",
    22: "Arc length of y = x^{4/3}",
    23: "Horizontal arc length of x = e^y",
    24: "Arc length with simplified √(1+(y')²)",
    25: "Arc length of a falling line",
    26: "Arc length of y = √(x+1)",
    27: "Three-segment polyline path",
    28: "Arc length of y = x³",
    29: "Horizontal arc length of x = 4 − y²",
    30: "Arc length of y = √(x²+1)",
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
    13: "√x about the y-axis",
    14: "e^{−x} about the x-axis",
    15: "x^{3/2} about the x-axis",
    16: "Surface about y = −1",
    17: "1/x about the x-axis",
    18: "Cone from y = mx about x-axis",
    19: "√(c − x) surface (variant)",
    20: "x = y² about the x-axis",
    21: "cos x about the x-axis",
    22: "Frustum from an endpoint line",
    23: "x² about the y-axis",
    24: "Full sphere from a semicircle",
    25: "2 + sin x about the x-axis",
    26: "√(4 − y) about the x-axis",
    27: "x^{1/3} about the x-axis",
    28: "Vertical segment cylinder about y-axis",
    29: "x²/2 about the x-axis",
    30: "√(2x) about the x-axis",
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
    17: "I_x under h + sin x",
    18: "I_x under h + e^{−x}",
    19: "I_y under square-root top",
    20: "I_x under 1 + x²",
    21: "I_x of a rising triangle",
    22: "I_y of a rising triangle",
    23: "Polar moment of a triangle",
    24: "I_y under log top",
    25: "Second moment about x = −d",
    26: "Centroidal I for a parabola",
    27: "I_y of a semicircle",
    28: "I_y under a linear top",
    29: "I_y with horizontal linear edge",
    30: "I_x under cosine top",
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
