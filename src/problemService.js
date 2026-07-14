/**
 * Problem module — finalize + Bank intake + procedural fallback.
 * Production path: Bank via bank.js / getBriggsProblem.
 * Materialization is owned by prepareProblem / materializeVisual — not re-run here beyond load.
 */

import { problem as bankProblem, problemCount as bankCount, loadBank, QUESTIONS_PER_TOPIC, TOPICS } from "./bank.js";
import { buildLegacySpec } from "./visualSpecs.js";
import { prepareProblem } from "./preparedProblem.js";

export { loadBank as loadBriggsBank, QUESTIONS_PER_TOPIC, TOPICS, bankCount as briggsProblemCount };

const choice = (id, latex, label) => ({ id, latex, label });
const shuffle = values => [...values].sort(() => Math.random() - 0.5);
const num = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const step = (title, body) => ({ title, body });

export function finalizeProblem(item) {
  if (!item) return null;
  item.choices = shuffle(item.choices || []);
  item.correctId =
    item.correctId ||
    item.choices.find(option => option.label === "Correct")?.id ||
    item.choices[0]?.id;
  return item;
}

/**
 * Procedural fallback — only when bank lacks the index.
 * Kept small: one representative problem per topic, not a dual curriculum.
 */
function proceduralFallback(topic) {
  const a = num(2, 8);
  const b = num(1, 6);
  const n = num(2, 5);
  const templates = {
    fundamentals: () => ({
      title: "Antiderivative",
      prompt: `Find \\(\\int (${a}x^${n} + ${b})\\,dx\\).`,
      choices: [
        choice("a", `\\frac{${a}}{${n + 1}}x^{${n + 1}} + ${b}x + C`, "Correct"),
        choice("b", `${a * n}x^{${n - 1}}+${b}`, "Differentiated"),
        choice("c", `\\frac{${a}}{${n}}x^{${n}} + ${b}`, "Forgot the power rule"),
        choice("d", `\\frac{${a}}{${n + 1}}x^{${n + 1}} + ${b} + C`, "Missed integral of constant")
      ],
      steps: [
        step("Power rule", `Raise the exponent and divide: \\(\\int x^{${n}}\\,dx=\\frac{x^{${n + 1}}}{${n + 1}}\\).`),
        step("Constant term", `\\(\\int ${b}\\,dx=${b}x\\).`),
        step("Family constant", "Include \\(+C\\).")
      ],
      finalAnswer: `\\int(${a}x^{${n}}+${b})\\,dx=\\frac{${a}}{${n + 1}}x^{${n + 1}}+${b}x+C`,
      insight: "Power rule: raise the exponent, divide by the new exponent, keep +C.",
      visual: "area"
    }),
    area: () => {
      const exact = (a * b * b) / 2;
      return {
        title: "Area",
        prompt: `Find the exact area under \\(y=${a}x\\) from \\(x=0\\) to \\(x=${b}\\).`,
        choices: [
          choice("a", `${exact}`, "Correct"),
          choice("b", `${a * b}`, "Used a rectangle"),
          choice("c", `${a * b * b}`, "Forgot one-half"),
          choice("d", `${(b * b) / 2}`, "Ignored coefficient")
        ],
        steps: [
          step("Definite integral", `\\(A=\\int_0^{${b}} ${a}x\\,dx\\).`),
          step("Evaluate", `\\(A=${exact}\\).`)
        ],
        finalAnswer: `A=${exact}`,
        insight: "Area is accumulated height × width.",
        visual: "area"
      };
    },
    volumes: () => {
      const b3 = b * b * b;
      const correct = `\\frac{${2 * a * b3}\\pi}{3}`;
      return {
        title: "Volume",
        prompt: `The region under \\(y=${a}x\\) from \\(x=0\\) to \\(x=${b}\\) is rotated about the y-axis. Find the exact volume.`,
        choices: [
          choice("a", correct, "Correct"),
          choice("b", `\\frac{${a * a * b3}\\pi}{3}`, "Forgot 2π"),
          choice("c", `\\frac{${a * b3}\\pi}{3}`, "Missing factor"),
          choice("d", `\\frac{${2 * b3}\\pi}{3}`, "Forgot coefficient")
        ],
        steps: [
          step("Shells", `\\(V=2\\pi\\int_0^{${b}} x(${a}x)\\,dx\\).`),
          step("Evaluate", `\\(V=${correct}\\).`)
        ],
        finalAnswer: `V=${correct}`,
        insight: "Shells: radius × height × 2π.",
        visual: "volume",
        dualMethod: true
      };
    },
    centroids: () => ({
      title: "Centroid",
      prompt: `A triangle has vertices \\((0,0)\\), \\((0,${a})\\), and \\((${b},0)\\). Find \\(\\bar{x}\\).`,
      choices: [
        choice("a", `\\frac{${b}}{3}`, "Correct"),
        choice("b", `\\frac{${b}}{2}`, "Midpoint"),
        choice("c", `\\frac{${a}}{3}`, "Used y"),
        choice("d", `${b}`, "Vertex")
      ],
      steps: [step("Average vertices", `\\(\\bar{x}=\\frac{0+0+${b}}{3}=\\frac{${b}}{3}\\).`)],
      finalAnswer: `\\bar{x}=\\frac{${b}}{3}`,
      insight: "Triangle centroid averages vertices.",
      visual: "centroid"
    }),
    arc: () => {
      const correct = `${n}\\sqrt{1+${a * a}}`;
      return {
        title: "Arc length",
        prompt: `Find the exact arc length of \\(y=${a}x+${b}\\) on \\(0\\le x\\le ${n}\\).`,
        choices: [
          choice("a", correct, "Correct"),
          choice("b", `${n}`, "Horizontal only"),
          choice("c", `${a * n}`, "Rise only"),
          choice("d", `${n}\\sqrt{${a}}`, "Wrong root")
        ],
        steps: [step("Formula", `\\(L=\\int_0^{${n}}\\sqrt{1+${a * a}}\\,dx=${correct}\\).`)],
        finalAnswer: `L=${correct}`,
        insight: "ds = sqrt(1 + (y')²) dx.",
        visual: "curve"
      };
    },
    surface: () => ({
      title: "Surface area",
      prompt: `Rotate \\(y=${a}x+${b}\\) about the x-axis on \\([0,${n}]\\). Set up the surface integral (exact form).`,
      choices: [
        choice("a", `2\\pi\\int_0^{${n}}(${a}x+${b})\\sqrt{1+${a * a}}\\,dx`, "Correct"),
        choice("b", `\\pi\\int_0^{${n}}(${a}x+${b})^{2}\\,dx`, "Disk volume"),
        choice("c", `2\\pi\\int_0^{${n}}(${a}x+${b})\\,dx`, "Forgot ds"),
        choice("d", `\\int_0^{${n}}\\sqrt{1+${a * a}}\\,dx`, "Arc length")
      ],
      steps: [step("Surface of revolution", "Radius is y; multiply by arc-length factor.")],
      finalAnswer: `S=2\\pi\\int_0^{${n}}(${a}x+${b})\\sqrt{1+${a * a}}\\,dx`,
      insight: "Surface: 2π y ds.",
      visual: "surface"
    }),
    inertia: () => ({
      title: "Moment of inertia",
      prompt: `For a rectangle base \\(${b}\\) height \\(${a}\\), find \\(I_x\\) about the base.`,
      choices: [
        choice("a", `\\frac{${b}\\cdot ${a}^{3}}{3}`, "Correct"),
        choice("b", `\\frac{${b}\\cdot ${a}^{3}}{12}`, "Centroidal"),
        choice("c", `\\frac{${a}\\cdot ${b}^{3}}{3}`, "Wrong axis"),
        choice("d", `${a * b}`, "Area only")
      ],
      steps: [step("Second moment", `\\(I_x=\\int_0^{${b}}\\frac{[${a}]^{3}}{3}\\,dx\\).`)],
      finalAnswer: `I_x=\\frac{${b}\\cdot ${a}^{3}}{3}`,
      insight: "Height cubed for strips parallel to the axis.",
      visual: "inertia"
    }),
    applications: () => {
      const lift = a + b;
      const work = a * 9.8 * (lift * b - (b * b) / 2);
      return {
        title: "Lifting work",
        prompt: `A \\(${a}\\)-meter chain with density \\(${b}\\) kg/m hangs vertically. Work (J) to lift it fully, \\(g=9.8\\)?`,
        choices: [
          choice("a", `${work}`, "Correct"),
          choice("b", `${a * b * 9.8 * lift}`, "Full height for all"),
          choice("c", `${Math.round(a * b)}`, "Mass only"),
          choice("d", `${Math.round(a * b * 9.8)}`, "Forgot distance")
        ],
        steps: [step("Variable lift", "Each segment travels a different distance.")],
        finalAnswer: `W=${work}\\text{ J}`,
        insight: "Integration for variable travel distance.",
        visual: "area"
      };
    }
  };
  const factory = templates[topic] || templates.fundamentals;
  const item = factory();
  item.given = { a, b, n };
  item.visualSpec = buildLegacySpec(item);
  item._specProvenance = "legacy";
  if (item.dualMethod === true) {
    item.dualMethod = Boolean(item.visualSpec?.alternateSpec);
  }
  item._proceduralFallback = true;
  return finalizeProblem(item);
}

/**
 * Load raw finalized problem for topic + index (Bank or procedural).
 * Does not materialize — Practice session prepareProblem owns that seam.
 */
export function loadProblemRow(topic, questionIndex) {
  const briggsCount = bankCount(topic);
  let item;
  if (questionIndex < briggsCount) {
    item = finalizeProblem(bankProblem(topic, questionIndex));
  } else {
    item = proceduralFallback(topic);
  }
  return item;
}

/**
 * Load + prepare once. Prefer createPracticeSession for Practice UI.
 * @returns {object|null} prepared.problem with dualMethod set
 */
export function loadProblem(topic, questionIndex) {
  const item = loadProblemRow(topic, questionIndex);
  if (!item) return null;
  const prepared = prepareProblem(item);
  const problem = prepared.problem || item;
  problem.dualMethod = prepared.dualMethod;
  problem._prepared = prepared;
  return problem;
}

/**
 * Visual label from prepared cache or one-shot prepare (for non-session callers).
 */
export function visualLabel(problem, { alternate = false } = {}) {
  if (problem?._prepared) {
    return problem._prepared.visualLabel(alternate);
  }
  return prepareProblem(problem).visualLabel(alternate);
}
