/**
 * Problem module — bank intake, finalize, optional procedural fallback.
 * Production path: generated bank via getBriggsProblem. Procedural library is
 * last-resort only when the bank cannot supply the index.
 */

import {
  getBriggsProblem,
  briggsProblemCount,
  loadBriggsBank,
  QUESTIONS_PER_TOPIC
} from "./briggsProblems.js";
import { buildLegacySpec } from "./visualSpecs.js";
import { ensureVisualSpec, materializeVisualExample } from "./materializeVisual.js";

export { loadBriggsBank, QUESTIONS_PER_TOPIC, briggsProblemCount };

export const TOPICS = {
  fundamentals: { label: "Fundamentals", icon: "∫", description: "Antiderivatives" },
  area: { label: "Area", icon: "▨", description: "Accumulated area" },
  volumes: { label: "Volumes", icon: "◒", description: "Shells & washers" },
  centroids: { label: "Centroids", icon: "◎", description: "Balance points" },
  arc: { label: "Arc Length", icon: "⌒", description: "Curve length" },
  surface: { label: "Surface Area", icon: "◌", description: "Revolution surface" },
  inertia: { label: "Inertia", icon: "I", description: "Area moments" },
  applications: { label: "Word Problems", icon: "W", description: "Work, pumping & motion" }
};

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
  if (item.dualMethod === true) {
    item.dualMethod = Boolean(item.visualSpec?.alternateSpec);
  }
  item._proceduralFallback = true;
  return finalizeProblem(item);
}

/**
 * Load the problem for topic + index. Prefers bank; procedural only if bank short.
 */
export function loadProblem(topic, questionIndex) {
  const briggsCount = briggsProblemCount(topic);
  let item;
  if (questionIndex < briggsCount) {
    item = finalizeProblem(getBriggsProblem(topic, null, questionIndex));
  } else {
    item = proceduralFallback(topic);
  }
  if (!item) return null;
  const { problem } = materializeVisualExample(item);
  // Preserve shuffled choices / correctId from finalize
  return Object.assign(problem || item, {
    choices: item.choices,
    correctId: item.correctId,
    ui: item.ui,
    result: item.result,
    _proceduralFallback: item._proceduralFallback
  });
}

export function visualLabel(problem, { alternate = false } = {}) {
  const { spec, dualMethod } = materializeVisualExample(problem, { alternate });
  if (dualMethod) return alternate ? "Horizontal strips" : "Vertical strips";
  if (spec?.title) return spec.title;
  const type = problem?.visual;
  return (
    {
      area: "Area slices",
      volume: alternate ? "Disks & washers" : "Shells",
      centroid: "Centroid",
      curve: "Arc length",
      surface: "Surface bands",
      inertia: "Axis distance"
    }[type] || "Visual"
  );
}

export { ensureVisualSpec, materializeVisualExample };
