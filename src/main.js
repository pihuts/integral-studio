import "katex/dist/katex.min.css";
import katex from "katex";
import "./style.css";
import { getBriggsProblem, briggsProblemCount, QUESTIONS_PER_TOPIC } from "./briggsProblems.js";
import { buildLegacySpec, resolveVisualSpec, problemHasDualMethod } from "./visualSpecs.js";
import { REFERENCES, openStaxWebUrl, sourceLink } from "./references.js";

const TOPICS = {
  fundamentals: { label: "Fundamentals", icon: "∫", description: "Antiderivatives" },
  area: { label: "Area", icon: "▨", description: "Accumulated area" },
  volumes: { label: "Volumes", icon: "◒", description: "Shells & washers" },
  centroids: { label: "Centroids", icon: "◎", description: "Balance points" },
  arc: { label: "Arc Length", icon: "⌒", description: "Curve length" },
  surface: { label: "Surface Area", icon: "◌", description: "Revolution surface" },
  inertia: { label: "Inertia", icon: "I", description: "Area moments" },
  applications: { label: "Word Problems", icon: "W", description: "Work, pumping & motion" }
};

const state = {
  screen: "landing",
  topic: "fundamentals",
  questionIndex: 0,
  correct: 0,
  attempts: 0,
  selected: null,
  checked: false,
  showSolution: false,
  method: "shells",
  slices: 16,
  playbackSpeed: 1,
  playbackProgress: 0,
  playing: true,
  alternate: false,
  problem: null,
  problemCache: {},
  animationStep: "region",
  animationStepText: "Sketch the bounded region.",
  vizLoading: true,
  vizError: null
};

const SCENE_ORIGIN = window.location.origin;
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarsePointer = () => window.matchMedia("(pointer: coarse)").matches;
const isNarrowViewport = () => window.matchMedia("(max-width: 600px)").matches;
const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");
state.playing = !prefersReducedMotion();

const STEP_PROGRESS = { region: 0, slice: 0.24, rotate: 0.43, stack: 0.72 };

function maxStrips() {
  return isCoarsePointer() || isNarrowViewport() ? 24 : 48;
}

function cameraControlHint() {
  if (isCoarsePointer()) {
    return "Drag to orbit · pinch to zoom · two-finger pan · focus diagram for arrows/±/R";
  }
  return "Drag to orbit · scroll to zoom · right-drag to pan · arrows orbit · ± zoom · R reset";
}

function vizPaletteFromCss() {
  const cs = getComputedStyle(document.documentElement);
  const get = name => cs.getPropertyValue(name).trim();
  return {
    canvas: (get("--media-canvas") || "#ede6d8").replace("#", ""),
    region: get("--viz-region") || "#c4887a",
    shell: get("--viz-shell") || "#bc9a62",
    solid: get("--viz-solid") || "#a04a3f",
    water: get("--viz-water") || "#3f8a5f",
    ink: get("--viz-ink") || "#7b2d26",
    line: get("--line") || "#d7ccbb",
    muted: get("--muted") || "#6b6158",
    panel: get("--panel") || "#fbf7f0",
    red: get("--red") || "#a23b3b",
    teal: get("--teal") || "#3f8a5f",
    accent: get("--accent") || "#bc9a62"
  };
}

function animationStepsFor(problem) {
  const method = resolveVisualSpec(problem, { alternate: state.alternate })?.method
    || problem?.visual
    || "area";
  if (method === "arc") {
    return [
      { id: "region", label: "Curve" },
      { id: "slice", label: "Points" },
      { id: "rotate", label: "Segments" },
      { id: "stack", label: "Sum" }
    ];
  }
  if (method === "pump-bowl") {
    return [
      { id: "region", label: "Bowl" },
      { id: "slice", label: "Slice" },
      { id: "rotate", label: "Lift" },
      { id: "stack", label: "Work" }
    ];
  }
  if (method === "pool-fill") {
    return [
      { id: "region", label: "Pool" },
      { id: "slice", label: "Slice" },
      { id: "rotate", label: "Volume" },
      { id: "stack", label: "Fill" }
    ];
  }
  if (method === "goat-barn") {
    return [
      { id: "region", label: "Barn" },
      { id: "slice", label: "Sector" },
      { id: "rotate", label: "Wrap" },
      { id: "stack", label: "Area" }
    ];
  }
  if (method === "surface-x" || method === "surface-y") {
    return [
      { id: "region", label: "Region" },
      { id: "slice", label: "Slice" },
      { id: "rotate", label: "Band" },
      { id: "stack", label: "Surface" }
    ];
  }
  if (method === "area" || method === "inertia" || problem?.visual === "area" || problem?.visual === "inertia") {
    return [
      { id: "region", label: "Region" },
      { id: "slice", label: "Strip" },
      { id: "rotate", label: "dA" },
      { id: "stack", label: "Sum" }
    ];
  }
  if (method === "centroid" || problem?.visual === "centroid") {
    return [
      { id: "region", label: "Region" },
      { id: "slice", label: "Slice" },
      { id: "rotate", label: "Moment" },
      { id: "stack", label: "Balance" }
    ];
  }
  return [
    { id: "region", label: "Region" },
    { id: "slice", label: "Slice" },
    { id: "rotate", label: "Rotate" },
    { id: "stack", label: "Stack" }
  ];
}

function choiceAriaLabel(option, index, problem) {
  const letter = "ABCD"[index];
  const base = `Choice ${letter}: ${mathDescription(option.latex)}`;
  if (!state.checked) return base;
  if (option.id === problem.correctId) return `${base}, correct answer`;
  if (state.selected === option.id) return `${base}, your incorrect answer`;
  return base;
}

function pillStatusIcon(status) {
  if (status === true) return '<span class="problem-pill-icon" aria-hidden="true">✓</span>';
  if (status === false) return '<span class="problem-pill-icon" aria-hidden="true">✕</span>';
  return "";
}

/** Questions shown per band in the bottom navigator (avoids a 50-pill scroll strip). */
const QUESTION_BAND = 10;

function questionBandStart(index) {
  return Math.floor(index / QUESTION_BAND) * QUESTION_BAND;
}

function renderProblemNavigator() {
  const current = state.questionIndex;
  const bandStart = questionBandStart(current);
  const bandEnd = Math.min(bandStart + QUESTION_BAND, QUESTIONS_PER_TOPIC);
  const bandCount = Math.ceil(QUESTIONS_PER_TOPIC / QUESTION_BAND);

  const bands = Array.from({ length: bandCount }, (_, i) => {
    const start = i * QUESTION_BAND;
    const end = Math.min(start + QUESTION_BAND, QUESTIONS_PER_TOPIC);
    const active = start === bandStart;
    let answered = 0;
    let correct = 0;
    for (let q = start; q < end; q += 1) {
      const status = problemStatus(q);
      if (status === true || status === false) answered += 1;
      if (status === true) correct += 1;
    }
    const progressHint = answered
      ? `, ${answered} tried${correct ? `, ${correct} correct` : ""}`
      : "";
    return `<button type="button" class="problem-band${active ? " active" : ""}${answered ? " has-progress" : ""}" data-question-band="${start}" aria-pressed="${active}" aria-label="Questions ${start + 1} to ${end}${progressHint}"><span class="problem-band-label">${start + 1}–${end}</span></button>`;
  }).join("");

  const pills = Array.from({ length: bandEnd - bandStart }, (_, offset) => {
    const index = bandStart + offset;
    const status = problemStatus(index);
    const statusWord = status === true ? ", correct" : status === false ? ", incorrect" : "";
    return `<button type="button" class="problem-pill ${index === current ? "active" : ""} ${status === true ? "correct" : ""} ${status === false ? "incorrect" : ""}" data-question="${index}" aria-label="Question ${index + 1}${statusWord}" aria-current="${index === current ? "step" : "false"}"><span class="problem-pill-num">${index + 1}</span>${pillStatusIcon(status)}</button>`;
  }).join("");

  return `
    <nav class="problem-navigator" aria-label="Questions">
      <div class="problem-nav-toolbar">
        <button type="button" class="secondary problem-nav-step" data-question-nav="previous" ${current === 0 ? "disabled" : ""} aria-label="Previous question">←</button>
        <form class="problem-jump" id="problem-jump" autocomplete="off">
          <label for="problem-jump-input" class="sr-only">Go to question</label>
          <input id="problem-jump-input" class="problem-jump-input" name="question" type="number" inputmode="numeric" min="1" max="${QUESTIONS_PER_TOPIC}" value="${current + 1}" title="Go to question" aria-describedby="problem-jump-hint" />
          <span id="problem-jump-hint" class="sr-only">Enter 1–${QUESTIONS_PER_TOPIC}, then Enter or Go.</span>
          <button type="submit" class="secondary problem-jump-go" aria-label="Go to question number">Go</button>
        </form>
        <div class="problem-bands" role="group" aria-label="Question ranges">${bands}</div>
        <p class="problem-nav-position" aria-live="polite"><span class="problem-nav-current">${current + 1}</span><span class="problem-nav-total">/${QUESTIONS_PER_TOPIC}</span></p>
        <button type="button" class="secondary problem-nav-step" data-question-nav="next" ${current === QUESTIONS_PER_TOPIC - 1 ? "disabled" : ""} aria-label="Next question">→</button>
      </div>
      <div class="problem-pills" role="list" aria-label="Questions ${bandStart + 1} to ${bandEnd}">${pills}</div>
    </nav>`;
}

function renderStepTrack(activeStep, problem) {
  const steps = animationStepsFor(problem);
  return `<ol class="step-track" aria-label="Animation steps">
    ${steps.map(step => {
      const active = step.id === activeStep;
      return `<li class="step-item-wrap">
        <button type="button"
          class="step-item${active ? " active" : ""}"
          data-step="${step.id}"
          data-step-jump="${step.id}"
          aria-current="${active ? "step" : "false"}"
          aria-label="Jump to ${escape(step.label)} phase">
          ${escape(step.label)}
        </button>
      </li>`;
    }).join("")}
  </ol>`;
}

function bindStepJumpControls() {
  document.querySelectorAll("[data-step-jump]").forEach(button => {
    button.addEventListener("click", () => {
      const step = button.dataset.stepJump;
      const progress = STEP_PROGRESS[step] ?? 0;
      state.playbackProgress = progress;
      state.playing = false;
      const progressInput = document.querySelector("#playback-progress");
      const progressOut = document.querySelector("#progress-out");
      if (progressInput) {
        progressInput.value = String(progress);
        syncSliderAria(progressInput, `${Math.round(progress * 100)} percent`);
      }
      if (progressOut) progressOut.textContent = `${Math.round(progress * 100)}%`;
      syncPlayButton();
      postToScene({ action: "setProgress", value: progress });
      updateAnimationStep(step);
    });
  });
}

function syncSliderAria(input, text) {
  if (input) input.setAttribute("aria-valuetext", text);
}

function syncPlayButton(playBtn = document.querySelector("#play-toggle")) {
  if (!playBtn) return;
  playBtn.textContent = state.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", String(state.playing));
  playBtn.setAttribute("aria-label", state.playing ? "Pause animation" : "Play animation");
}

function applyDualMethodUi(problem) {
  document.querySelectorAll("[data-method]").forEach(btn => {
    const selected = (btn.dataset.method === "washers") === state.alternate;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
  const title = document.querySelector("#visual-title");
  if (title) title.textContent = visualLabel(problem);
  const track = document.querySelector(".step-track");
  if (track) {
    track.outerHTML = renderStepTrack(state.animationStep, problem);
    bindStepJumpControls();
  }
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const normalizeLatex = value => String(value).replace(/\\\\/g, "\\");
const tex = (value, display = false) => katex.renderToString(normalizeLatex(value), {
  displayMode: display,
  throwOnError: false,
  strict: "ignore",
  // Never allow KaTeX trust commands (\html, \href javascript:, etc.).
  trust: false,
  maxSize: 20,
  maxExpand: 500
});
/** Escape plain text; only KaTeX output for \(...\) / \[...\] is trusted HTML. */
const richMath = value => {
  const source = normalizeLatex(value);
  const re = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (match.index > lastIndex) {
      result += escape(source.slice(lastIndex, match.index)).replace(/\n/g, "<br>");
    }
    result += match[1] != null ? tex(match[1], true) : tex(match[2], false);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    result += escape(source.slice(lastIndex)).replace(/\n/g, "<br>");
  }
  return result;
};
/** Allow only relative app paths or http(s) URLs — blocks javascript:/data: links. */
const safeUrl = value => {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    /* ignore invalid */
  }
  return "";
};
const mathDescription = value => normalizeLatex(value)
  .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 over $2")
  .replace(/\\sqrt\{([^{}]+)\}/g, "square root of $1")
  .replace(/\\int_\{?([0-9a-zA-Z])\}?\^\{?([0-9a-zA-Z])\}?/g, " integral from $1 to $2 of ")
  .replace(/\\pi/g, " pi ")
  .replace(/\\,/g, " ")
  .replace(/\^\{([^{}]+)\}/g, " to the power of $1")
  .replace(/\^([^\s{}])/g, " to the power of $1")
  .replace(/[\\{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const choice = (id, latex, label) => ({ id, latex, label });
const shuffle = values => [...values].sort(() => Math.random() - 0.5);
const num = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const step = (title, body) => ({ title, body });

function renderSourceTag(source = "") {
  if (!source) return "";
  const href = safeUrl(sourceLink(source));
  const inner = escape(source);
  return href
    ? `<a class="question-source" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<span class="question-source">${inner}</span>`;
}

function renderReferenceCard(ref) {
  const pdfHref = safeUrl(ref.publicPath);
  const webHref = safeUrl(ref.webBase ? openStaxWebUrl("5.2") : null);
  const links = [
    pdfHref ? `<a class="reference-link" href="${escape(pdfHref)}" target="_blank" rel="noopener noreferrer">PDF</a>` : "",
    webHref ? `<a class="reference-link" href="${escape(webHref)}" target="_blank" rel="noopener noreferrer">Web</a>` : ""
  ].filter(Boolean).join("");
  return `
    <article class="reference-card">
      <h3 class="reference-title">${escape(ref.title)}</h3>
      <p class="reference-meta">${escape(ref.authors)} · ${escape(ref.file)}</p>
      <div class="reference-links">${links}</div>
    </article>`;
}

function finalizeProblem(item) {
  item.choices = shuffle(item.choices);
  item.correctId = item.choices.find(option => option.label === "Correct")?.id;
  return item;
}

function makeProblem(topic) {
  const briggsCount = briggsProblemCount(topic);
  if (state.questionIndex < briggsCount) {
    return finalizeProblem(getBriggsProblem(topic, null, state.questionIndex));
  }

  const range = { a: [2, 8], b: [1, 6], n: [2, 5] };
  const a = num(range.a[0], range.a[1]);
  const b = num(range.b[0], range.b[1]);
  const n = num(range.n[0], range.n[1]);

  const library = {
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
        step(
          "What an integral asks for",
          `Integration reverses differentiation. We want every function whose derivative is the integrand \\(${a}x^{${n}}+${b}\\). That family is the antiderivative.`
        ),
        step(
          "Split the integral term by term",
          `Addition is safe under the integral sign: \\[\\int(${a}x^{${n}}+${b})\\,dx=${a}\\int x^{${n}}\\,dx+\\int ${b}\\,dx\\]`
        ),
        step(
          "Apply the power rule",
          `Raise the exponent by one, then divide by the new exponent: \\[\\int x^{p}\\,dx=\\frac{x^{p+1}}{p+1}+C\\] With \\(p=${n}\\), \\[${a}\\int x^{${n}}\\,dx=${a}\\cdot\\frac{x^{${n + 1}}}{${n + 1}}=\\frac{${a}}{${n + 1}}x^{${n + 1}}\\]`
        ),
        step(
          "Integrate the constant term",
          `A constant becomes a linear term: \\[\\int ${b}\\,dx=${b}x\\]`
        ),
        step(
          "Include the family constant",
          `Differentiating erases constants, so the full answer ends with \\(+C\\) — every valid antiderivative differs only by that constant.`
        )
      ],
      finalAnswer: `\\int(${a}x^{${n}}+${b})\\,dx=\\frac{${a}}{${n + 1}}x^{${n + 1}}+${b}x+C`,
      insight: "Power rule: raise the exponent, divide by the new exponent, and keep \\(+C\\).",
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
          step(
            "Turn area into a definite integral",
            `When \\(f\\) is continuous and nonnegative, the exact area under the graph from \\(x=0\\) to \\(x=${b}\\) is \\[A=\\int_0^{${b}} ${a}x\\,dx\\]`
          ),
          step(
            "Read a thin vertical strip",
            `At a fixed \\(x\\), strip height is \\(f(x)=${a}x\\) and width is \\(dx\\), so \\(dA=(${a}x)\\,dx\\). The integral adds every strip.`
          ),
          step(
            "Evaluate the antiderivative",
            `\\[${a}\\int_0^{${b}} x\\,dx=${a}\\left[\\frac{x^2}{2}\\right]_0^{${b}}=${a}\\left(\\frac{${b}^2}{2}-0\\right)\\]`
          ),
          step(
            "Simplify to the exact value",
            `\\[A=${a}\\cdot\\frac{${b * b}}{2}=${exact}\\] square units.`
          )
        ],
        finalAnswer: `A=${exact}`,
        insight: "Area is accumulated height × width — then take the continuous limit.",
        visual: "area"
      };
    },

    volumes: () => {
      const b3 = b * b * b;
      const correct = `\\frac{${2 * a * b3}\\pi}{3}`;
      const wrongDisk = `\\frac{${a * a * b3}\\pi}{3}`;
      const wrongHalf = `\\frac{${a * b3}\\pi}{3}`;
      const wrongNoA = `\\frac{${2 * b3}\\pi}{3}`;
      return {
        title: "Volume",
        prompt: `The region under \\(y=${a}x\\) from \\(x=0\\) to \\(x=${b}\\) is rotated about the y-axis. Find the exact volume.`,
        choices: [
          choice("a", correct, "Correct"),
          choice("b", wrongDisk, "Forgot the shell factor \\(2\\pi\\)"),
          choice("c", wrongHalf, "Missing a factor of 2"),
          choice("d", wrongNoA, "Forgot the height coefficient")
        ],
        steps: [
          step(
            "Shells with vertical strips",
            `Use a vertical strip parallel to the y-axis: radius \\(r=x\\), height \\(h=${a}x\\), thickness \\(dx\\).`
          ),
          step(
            "Write the shell integral",
            `\\[V=2\\pi\\int_0^{${b}} x(${a}x)\\,dx=2\\pi ${a}\\int_0^{${b}} x^{2}\\,dx\\]`
          ),
          step(
            "Find an antiderivative",
            `\\[\\int x^{2}\\,dx=\\frac{x^{3}}{3}\\]`
          ),
          step(
            "Evaluate the upper bound",
            `\\[\\frac{(${b})^{3}}{3}=\\frac{${b3}}{3}\\]`
          ),
          step(
            "Evaluate the lower bound",
            `\\[\\frac{(0)^{3}}{3}=0\\]`
          ),
          step(
            "Subtract and multiply the constants",
            `\\[V=2\\pi ${a}\\left(\\frac{${b3}}{3}-0\\right)=\\frac{${2 * a * b3}\\pi}{3}\\]`
          )
        ],
        alternateSteps: [
          step(
            "Disks with horizontal strips",
            `Slice horizontally and revolve about the y-axis. At height \\(y\\), the radius is \\(R=x=y/${a}\\) and thickness is \\(dy\\).`
          ),
          step(
            "Write the disk integral",
            `\\[V=\\pi\\int_0^{${a * b}}\\left(\\frac{y}{${a}}\\right)^2\\,dy=\\frac{\\pi}{${a * a}}\\int_0^{${a * b}} y^{2}\\,dy\\]`
          ),
          step(
            "Find an antiderivative",
            `\\[\\int y^{2}\\,dy=\\frac{y^{3}}{3}\\]`
          ),
          step(
            "Evaluate the upper bound",
            `\\[\\frac{(${a * b})^{3}}{3}=\\frac{${a * a * a * b3}}{3}\\]`
          ),
          step(
            "Evaluate the lower bound",
            `\\[\\frac{(0)^{3}}{3}=0\\]`
          ),
          step(
            "Subtract and multiply the constants",
            `\\[V=\\frac{\\pi}{${a * a}}\\left(\\frac{${a * a * a * b3}}{3}-0\\right)=\\frac{${2 * a * b3}\\pi}{3}\\]`
          )
        ],
        finalAnswer: `V=\\frac{${2 * a * b3}\\pi}{3}`,
        insight: "The same volume works with either vertical shells or horizontal disks — only the slice direction changes.",
        visual: "volume",
        dualMethod: true
      };
    },

    centroids: () => ({
      title: "Centroid",
      prompt: `A triangle has vertices \\((0,0)\\), \\((0,${a})\\), and \\((${b},0)\\). Find the exact value of \\(\\bar{x}\\).`,
      choices: [
        choice("a", `\\frac{${b}}{3}`, "Correct"),
        choice("b", `\\frac{${b}}{2}`, "Midpoint"),
        choice("c", `\\frac{${a}}{3}`, "Used y-coordinate"),
        choice("d", `${b}`, "Vertex")
      ],
      steps: [
        step(
          "What the centroid represents",
          `For a uniform plate, the centroid is the balance point — the average location of all area.`
        ),
        step(
          "Use the triangle vertex formula",
          `For vertices \\((x_1,y_1),(x_2,y_2),(x_3,y_3)\\), \\[\\bar{x}=\\frac{x_1+x_2+x_3}{3}\\]`
        ),
        step(
          "Average the three x-coordinates",
          `Vertices are \\((0,0)\\), \\((0,${a})\\), and \\((${b},0)\\): \\[\\bar{x}=\\frac{0+0+${b}}{3}=\\frac{${b}}{3}\\]`
        ),
        step(
          "Sanity check",
          `A right triangle’s centroid sits one-third of the way from the right angle along each median — not at a side midpoint.`
        )
      ],
      finalAnswer: `\\bar{x}=\\frac{${b}}{3}`,
      insight: "Triangle centroids average the three vertices: sum the coordinates and divide by 3.",
      visual: "centroid"
    }),

    arc: () => {
      const correct = `${n}\\sqrt{1+${a * a}}`;
      return {
        title: "Arc length",
        prompt: `Find the exact arc length of \\(y=${a}x+${b}\\) on \\(0\\le x\\le ${n}\\).`,
        choices: [
          choice("a", correct, "Correct"),
          choice("b", `${n * a}`, "Only vertical change times length"),
          choice("c", `${n}\\sqrt{1+${a}}`, "Derivative not squared"),
          choice("d", `${(a * n * n) / 2 + b * n}`, "Computed area instead")
        ],
        steps: [
          step(
            "Zoom into a tiny piece of the curve",
            `A short segment has horizontal change \\(dx\\) and vertical change \\(dy=f'(x)\\,dx\\). Length is the hypotenuse.`
          ),
          step(
            "Write the arc-length element",
            `\\[ds=\\sqrt{1+[f'(x)]^{2}}\\,dx\\]`
          ),
          step(
            "Differentiate the given line",
            `\\(f(x)=${a}x+${b}\\) has constant slope \\(f'(x)=${a}\\), so \\[ds=\\sqrt{1+${a * a}}\\,dx\\]`
          ),
          step(
            "Integrate and simplify",
            `\\[L=\\int_0^{${n}}\\sqrt{1+${a * a}}\\,dx=\\sqrt{1+${a * a}}\\cdot ${n}=${n}\\sqrt{1+${a * a}}\\]`
          )
        ],
        finalAnswer: `L=${n}\\sqrt{1+${a * a}}`,
        insight: "Arc length uses the derivative inside a square root — not the original function.",
        visual: "curve"
      };
    },

    surface: () => {
      const inner = `${a}\\cdot\\frac{${n}^{2}}{2}+${b}\\cdot ${n}`;
      const correct = `2\\pi\\sqrt{1+${a * a}}\\left(${inner}\\right)`;
      const wrongVol = `\\pi\\left(\\frac{${a * a} ${n}^{3}}{3}+${a * b} ${n}^{2}+${b * b} ${n}\\right)`;
      const wrongNoSlant = `2\\pi\\left(${inner}\\right)`;
      const wrongArc = `${n}\\sqrt{1+${a * a}}`;
      return {
        title: "Surface area",
        prompt: `The graph of \\(y=${a}x+${b}\\) on \\(0\\le x\\le ${n}\\) is rotated about the x-axis. Find the exact surface area.`,
        choices: [
          choice("a", correct, "Correct"),
          choice("b", wrongVol, "Volume formula"),
          choice("c", wrongNoSlant, "Missing slant factor"),
          choice("d", wrongArc, "Arc length only")
        ],
        steps: [
          step(
            "Picture a thin band on the surface",
            `Rotating a short curve segment about the x-axis sweeps a narrow band. Area is circumference times slant length.`
          ),
          step(
            "Identify radius and slant length",
            `Radius is \\(y=${a}x+${b}\\). Slant length is \\(ds=\\sqrt{1+${a * a}}\\,dx\\).`
          ),
          step(
            "Form the surface integral",
            `\\[S=2\\pi\\int_0^{${n}}(${a}x+${b})\\sqrt{1+${a * a}}\\,dx=2\\pi\\sqrt{1+${a * a}}\\int_0^{${n}}(${a}x+${b})\\,dx\\]`
          ),
          step(
            "Evaluate the remaining integral",
            `\\[\\int_0^{${n}}(${a}x+${b})\\,dx=\\left[\\frac{${a}}{2}x^{2}+${b}x\\right]_0^{${n}}=${inner}\\] so \\[S=2\\pi\\sqrt{1+${a * a}}\\left(${inner}\\right)\\]`
          )
        ],
        finalAnswer: `S=2\\pi\\sqrt{1+${a * a}}\\left(${inner}\\right)`,
        insight: "Surface of revolution: \\(2\\pi \\times \\text{radius} \\times \\text{slant length}\\).",
        visual: "surface"
      };
    },

    inertia: () => {
      const correct = `\\frac{${b}\\cdot ${a}^{3}}{12}`;
      return {
        title: "Moment of inertia",
        prompt: `A rectangle has base \\(${b}\\) and height \\(${a}\\). Find the exact centroidal area moment of inertia about the x-axis.`,
        choices: [
          choice("a", correct, "Correct"),
          choice("b", `\\frac{${a}\\cdot ${b}^{3}}{12}`, "About y-axis"),
          choice("c", `${a * b}`, "Area only"),
          choice("d", `\\frac{${b}\\cdot ${a}^{2}}{2}`, "Missing distance squared")
        ],
        steps: [
          step(
            "What \\(I_x\\) measures",
            `Area moment of inertia about the x-axis weights each area piece by the square of its distance from that axis.`
          ),
          step(
            "Use the standard rectangle formula",
            `About the centroidal x-axis (through the center, parallel to the base): \\[I_x=\\frac{b h^{3}}{12}\\]`
          ),
          step(
            "Substitute base and height",
            `With \\(b=${b}\\) and \\(h=${a}\\): \\[I_x=\\frac{${b}\\cdot ${a}^{3}}{12}\\]`
          ),
          step(
            "Check the axis orientation",
            `\\(\\frac{h b^{3}}{12}\\) would be about the centroidal y-axis. The dimension perpendicular to the axis is cubed.`
          )
        ],
        finalAnswer: `I_x=\\frac{${b}\\cdot ${a}^{3}}{12}`,
        insight: "Distance is squared in the definition — height enters as \\(h^{3}\\) for a horizontal centroidal axis.",
        visual: "inertia"
      };
    },

    applications: () => {
      const lift = a + b;
      const work = a * 9.8 * (lift * b - (b * b) / 2);
      return {
        title: "Lifting work",
        prompt: `A \\(${a}\\)-meter chain with density \\(${b}\\) kg/m hangs vertically. How much work (in joules) is required to lift it to the top, using \\(g=9.8\\) m/s\\(^2\\)?`,
        choices: [
          choice("a", `${work}`, "Correct"),
          choice("b", `${a * b * 9.8 * lift}`, "Lifted entire chain full height"),
          choice("c", `${Math.round(a * b)}`, "Mass only"),
          choice("d", `${Math.round(a * b * 9.8)}`, "Forgot lift distance")
        ],
        steps: [
          step(
            "Slice the chain horizontally",
            `A segment at height \\(y\\) (from the bottom) has mass \\(\\rho\\,dy\\) and must be lifted \\(${lift}-y\\) meters.`
          ),
          step(
            "Write the work integral",
            `\\[W=\\int_0^{${a}} ${b}(9.8)(${lift}-y)\\,dy=${b * 9.8}\\int_0^{${a}}(${lift}-y)\\,dy\\]`
          ),
          step(
            "Find an antiderivative",
            `\\[\\int(${lift}-y)\\,dy=${lift}y-\\frac{y^2}{2}\\]`
          ),
          step(
            "Evaluate the upper bound",
            `\\[${lift}(${a})-\\frac{(${a})^{2}}{2}=${lift * a - (a * a) / 2}\\]`
          ),
          step(
            "Evaluate the lower bound",
            `\\[${lift}(0)-\\frac{(0)^{2}}{2}=0\\]`
          ),
          step(
            "Subtract and multiply density and gravity",
            `\\[W=${b * 9.8}\\left(${lift * a - (a * a) / 2}-0\\right)=${work}\\text{ J}\\]`
          )
        ],
        finalAnswer: `W=${work}\\text{ J}`,
        insight: "Different chain segments travel different distances — integration is required.",
        visual: "area"
      };
    }
  };

  const item = library[topic]();
  item.given = { a, b, n };
  item.visualSpec = buildLegacySpec(item);
  if (item.dualMethod === true) {
    item.dualMethod = Boolean(item.visualSpec?.alternateSpec);
  }
  return finalizeProblem(item);
}

function saveProgress() {
  localStorage.setItem("integral-studio-progress", JSON.stringify({
    topic: state.topic,
    correct: state.correct,
    attempts: state.attempts
  }));
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem("integral-studio-progress") || "{}");
    if (saved.topic && TOPICS[saved.topic]) state.topic = saved.topic;
    if (typeof saved.correct === "number") state.correct = saved.correct;
    if (typeof saved.attempts === "number") state.attempts = saved.attempts;
  } catch { /* optional */ }
}

function problemKey() {
  return `${state.topic}:${state.questionIndex}`;
}

function currentProblem() {
  const key = problemKey();
  return state.problemCache[key] || (state.problemCache[key] = makeProblem(state.topic));
}

function problemStatus(index) {
  return state.problemCache[`${state.topic}:${index}`]?.result;
}

function saveQuestionState() {
  if (state.problem) {
    state.problem.ui = {
      selected: state.selected,
      checked: state.checked,
      showSolution: state.showSolution
    };
  }
}

function restoreQuestionState(problem) {
  Object.assign(state, problem.ui || { selected: null, checked: false, showSolution: false });
}

function goToQuestion(index) {
  saveQuestionState();
  state.questionIndex = Math.max(0, Math.min(QUESTIONS_PER_TOPIC - 1, index));
  state.problem = currentProblem();
  restoreQuestionState(state.problem);
  render();
}

function startPractice() {
  state.screen = "practice";
  state.questionIndex = 0;
  state.problemCache = {};
  state.problem = currentProblem();
  Object.assign(state, { selected: null, checked: false, showSolution: false });
  saveProgress();
  render();
}

function goLanding() {
  saveQuestionState();
  state.screen = "landing";
  render();
}

function visualLabel(problem) {
  const spec = resolveVisualSpec(problem, { alternate: state.alternate });
  if (problemHasDualMethod(problem)) return state.alternate ? "Horizontal strips" : "Vertical strips";
  if (spec?.title) return spec.title;
  if (state.topic === "fundamentals") return "Rate of change";
  if (state.topic === "applications") return "Slice & sum";
  const type = problem.visual;
  return ({
    area: "Area slices",
    volume: state.alternate ? "Disks & washers" : "Shells",
    centroid: "Centroid",
    curve: "Arc length",
    surface: "Surface bands",
    inertia: "Axis distance"
  })[type] || "Visual";
}

function solutionMethodLabel(problem, alternate) {
  const spec = resolveVisualSpec(problem, { alternate });
  const vertical = spec?.orientation === "vertical";
  const shells = spec?.method?.startsWith("shell");
  const slice = vertical ? "Vertical strips" : "Horizontal strips";
  const sweep = shells ? "shells" : "disks or washers";
  return `${slice} → ${sweep}`;
}

/** Template formulas for beginners, keyed by visual method / topic. */
function equationsForProblem(problem) {
  if (Array.isArray(problem?.equations) && problem.equations.length) {
    return problem.equations;
  }
  const method = resolveVisualSpec(problem, { alternate: state.alternate })?.method
    || problem?.visualParams?.method
    || problem?.visual
    || state.topic
    || "";
  const m = String(method).toLowerCase();
  const topic = state.topic;
  if (topic === "fundamentals" || m.includes("fund")) {
    return [
      "\\int x^{n}\\,dx=\\frac{x^{n+1}}{n+1}+C\\quad(n\\neq-1)",
      "\\int\\big(f+g\\big)\\,dx=\\int f\\,dx+\\int g\\,dx",
      "\\int c\\,f(x)\\,dx=c\\int f(x)\\,dx"
    ];
  }
  if (m.startsWith("shell")) {
    return [
      "V=2\\pi\\int_a^b(\\text{radius})(\\text{height})\\,dx",
      "dV=2\\pi\\,r\\,h\\,dx"
    ];
  }
  if (m.startsWith("washer")) {
    return [
      "V=\\pi\\int_a^b\\Big(R_{\\text{outer}}^{2}-R_{\\text{inner}}^{2}\\Big)\\,dx",
      "dV=\\pi\\big(R_{\\text{out}}^{2}-R_{\\text{in}}^{2}\\big)\\,dx"
    ];
  }
  if (m.startsWith("disk")) {
    return [
      "V=\\pi\\int_a^b\\big[R(x)\\big]^{2}\\,dx",
      "dV=\\pi R^{2}\\,dx"
    ];
  }
  if (m.startsWith("surface") || topic === "surface") {
    return [
      "S=2\\pi\\int_a^b y\\sqrt{1+[y']^{2}}\\,dx\\quad(\\text{about }x\\text{-axis})",
      "dS=2\\pi\\,(\\text{radius})\\,ds"
    ];
  }
  if (m === "arc" || topic === "arc" || problem?.visual === "curve") {
    return [
      "L=\\int_a^b\\sqrt{1+[f'(x)]^{2}}\\,dx",
      "ds=\\sqrt{1+[y']^{2}}\\,dx"
    ];
  }
  if (topic === "centroids" || problem?.visual === "centroid") {
    return [
      "A=\\int_a^b f(x)\\,dx",
      "\\bar{x}=\\frac{1}{A}\\int_a^b x f(x)\\,dx",
      "\\bar{y}=\\frac{1}{A}\\int_a^b\\frac{1}{2}[f(x)]^{2}\\,dx"
    ];
  }
  if (topic === "inertia" || problem?.visual === "inertia") {
    return [
      "I_x=\\int_a^b\\frac{[f(x)]^{3}}{3}\\,dx\\quad(\\text{vertical strip})",
      "I_y=\\int_a^b x^{2} f(x)\\,dx\\quad(\\text{about }y\\text{-axis})"
    ];
  }
  if (topic === "applications") {
    return [
      "W=\\int_a^b F(x)\\,dx",
      "F_{\\text{spring}}=kx,\\quad W=\\tfrac12 k x^{2}"
    ];
  }
  if (topic === "area" || m === "area" || problem?.visual === "area") {
    return [
      "A=\\int_a^b\\big[f_{\\text{top}}(x)-f_{\\text{bottom}}(x)\\big]\\,dx",
      "\\int_a^b f(x)\\,dx=F(b)-F(a)"
    ];
  }
  if (topic === "volumes") {
    return [
      "V=\\pi\\int R^{2}\\,dx\\quad(\\text{disk/washer})",
      "V=2\\pi\\int r h\\,dx\\quad(\\text{shell})"
    ];
  }
  return ["\\text{total}=\\int(\\text{slice amount})"];
}

function renderEquationsBox(equations) {
  if (!equations?.length) return "";
  const rows = equations.map(eq => `
    <li class="solution-equation-item">
      <div class="solution-equation-math">${tex(eq, true)}</div>
    </li>`).join("");
  return `
    <aside class="solution-equations" aria-label="Equations to use">
      <p class="solution-equations-label">Equations to use</p>
      <ol class="solution-equations-list">${rows}</ol>
    </aside>`;
}

function renderSolutionSteps(steps, startIndex = 1) {
  return steps.map((item, index) => {
    const title = typeof item === "string" ? `Step ${startIndex + index}` : item.title;
    const body = typeof item === "string" ? item : item.body;
    return `
      <li class="solution-step">
        <div class="solution-step-marker" aria-hidden="true">${startIndex + index}</div>
        <div class="solution-step-body">
          <h3 class="solution-step-title">${richMath(title)}</h3>
          <div class="solution-step-text">${richMath(body)}</div>
        </div>
      </li>`;
  }).join("");
}

function renderSolution(p, correct) {
  const dual = problemHasDualMethod(p);
  const primarySteps = state.alternate && p.alternateSteps?.length ? p.alternateSteps : p.steps;
  const secondarySteps = state.alternate ? p.steps : p.alternateSteps;
  const secondaryLabel = solutionMethodLabel(p, !state.alternate);
  const equationsHtml = renderEquationsBox(equationsForProblem(p));
  const stepsHtml = renderSolutionSteps(primarySteps);
  const alternateHtml = dual && secondarySteps?.length ? `
    <div class="solution-method-block">
      <h3 class="solution-method-title">Alternate approach: ${secondaryLabel}</h3>
      <p class="solution-method-note">Same region and axis — switch the slice direction. Toggle the control above to animate this setup.</p>
      <ol class="solution-steps solution-steps-alt">${renderSolutionSteps(secondarySteps, primarySteps.length + 1)}</ol>
    </div>` : "";

  return `
    <section class="solution-panel is-open" id="solution-panel" aria-labelledby="solution-title" tabindex="-1">
      <div class="solution-banner ${correct ? "is-correct" : "is-incorrect"}">
        <h2 id="solution-title">Worked solution</h2>
      </div>
      ${equationsHtml}
      <ol class="solution-steps">${stepsHtml}</ol>
      ${alternateHtml}
      ${p.finalAnswer ? `
        <div class="solution-answer" role="region" aria-label="Final answer">
          <p class="solution-answer-label">Final answer</p>
          <div class="solution-answer-math">${tex(p.finalAnswer, true)}</div>
        </div>` : ""}
      ${p.insight ? `
        <aside class="solution-insight" aria-label="Key takeaway">
          <p class="solution-insight-label">Remember</p>
          <p class="solution-insight-text">${richMath(p.insight)}</p>
        </aside>` : ""}
    </section>`;
}

function renderLanding() {
  document.querySelector("#app").innerHTML = `
    <div class="landing">
      <header class="landing-top">
        <div class="brand landing-brand">
          <span class="brand-mark" aria-hidden="true">∫</span>
          <span>CEE 103</span>
        </div>
      </header>
      <main class="landing-main">
        <h1 class="landing-title">Practice integrals</h1>
        <section class="landing-section" aria-labelledby="topic-heading">
          <h2 id="topic-heading" class="landing-label">Topic</h2>
          <div class="topic-grid" role="listbox" aria-labelledby="topic-heading">
            ${Object.entries(TOPICS).map(([id, item]) => `
              <button type="button" class="topic-card ${state.topic === id ? "selected" : ""}" role="option" aria-selected="${state.topic === id}" data-topic="${id}">
                <span class="topic-card-icon" aria-hidden="true">${item.icon}</span>
                <span class="topic-card-label">${item.label}</span>
                <span class="topic-card-desc">${escape(item.description)}</span>
              </button>
            `).join("")}
          </div>
        </section>
        <button type="button" id="start-practice" class="primary landing-start">Start practice</button>
        <section class="landing-section landing-references" aria-labelledby="refs-heading">
          <h2 id="refs-heading" class="landing-label">References</h2>
          <div class="reference-grid">
            ${REFERENCES.map(renderReferenceCard).join("")}
          </div>
        </section>
      </main>
    </div>`;

  document.querySelectorAll("[data-topic]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.topic = btn.dataset.topic;
      renderLanding();
    });
  });
  document.querySelector("#start-practice")?.addEventListener("click", startPractice);
}

function renderPractice(options = {}) {
  const { preserveVisual = false } = options;
  const existingVisual = preserveVisual ? document.querySelector(".visual-panel") : null;
  const topic = TOPICS[state.topic];
  const p = state.problem || (state.problem = makeProblem(state.topic));
  const correct = state.checked && state.selected === p.correctId;

  document.querySelector("#app").innerHTML = `
    <header class="topbar">
      <button type="button" class="brand brand-button" id="go-home" aria-label="Back to topics">
        <span class="brand-mark" aria-hidden="true">∫</span>
        <span>CEE 103</span>
      </button>
      <div class="topbar-meta">
        <span class="topbar-topic">${topic.label}</span>
        <span class="topbar-progress">${state.questionIndex + 1}/${QUESTIONS_PER_TOPIC}</span>
      </div>
    </header>
    <div class="app-shell">
      <main class="workspace">
        <div class="content-grid">
          <section class="visual-panel" aria-labelledby="visual-title">
            <div class="visual-head compact">
              <div class="visual-head-row">
                <h2 id="visual-title">${escape(visualLabel(p))}</h2>
                ${renderStepTrack(state.animationStep, p)}
                <button type="button" id="camera-hint" class="visual-camera-hint" title="${escape(cameraControlHint())}" aria-label="${escape(cameraControlHint())}">?</button>
              </div>
              <p id="step-detail" class="step-detail" aria-live="polite">${escape(state.animationStepText)}</p>
            </div>
            <div id="three-host" class="viz-host${state.vizLoading ? " is-loading" : ""}${state.vizError ? " has-error" : ""}" role="region" aria-label="Concept visualization" aria-busy="${state.vizLoading}" aria-describedby="camera-hint">
              <div class="viz-loading" id="viz-loading" aria-hidden="${state.vizLoading && !state.vizError ? "false" : "true"}">
                <span class="viz-loading-bar" aria-hidden="true"></span>
                <span class="viz-loading-text">Loading visualization…</span>
              </div>
              <div class="viz-error" id="viz-error" role="alert" aria-hidden="${state.vizError ? "false" : "true"}"${state.vizError ? "" : " hidden"}>
                <p class="viz-error-text">${escape(state.vizError || "Couldn't load the visualization.")}</p>
                <button type="button" id="viz-retry" class="secondary control-btn">Try again</button>
              </div>
            </div>
            <div class="model-controls">
              ${problemHasDualMethod(p) ? `
                <div class="segmented" role="group" aria-label="Slice direction">
                  <button type="button" class="${!state.alternate ? "selected" : ""}" data-method="shells" aria-pressed="${!state.alternate}">Vertical strips</button>
                  <button type="button" class="${state.alternate ? "selected" : ""}" data-method="washers" aria-pressed="${state.alternate}">Horizontal strips</button>
                </div>
              ` : ""}
              <div class="control-grid">
                <label class="control-field">
                  <span class="control-label">Strips</span>
                  <input id="slices" type="range" min="4" max="${maxStrips()}" value="${Math.min(state.slices, maxStrips())}" aria-valuetext="${Math.min(state.slices, maxStrips())} strips">
                  <output id="slices-out" for="slices">${Math.min(state.slices, maxStrips())}</output>
                </label>
                <label class="control-field">
                  <span class="control-label">Speed</span>
                  <input id="playback-speed" type="range" min="0.25" max="3" step="0.05" value="${state.playbackSpeed}" aria-valuetext="${Number(state.playbackSpeed).toFixed(2)} times speed">
                  <output id="speed-out" for="playback-speed">${Number(state.playbackSpeed).toFixed(2)}×</output>
                </label>
                <label class="control-field control-field-wide">
                  <span class="control-label">Progress</span>
                  <input id="playback-progress" type="range" min="0" max="1" step="0.001" value="${state.playbackProgress}" aria-valuetext="${Math.round(state.playbackProgress * 100)} percent">
                  <output id="progress-out" for="playback-progress">${Math.round(state.playbackProgress * 100)}%</output>
                </label>
                <div class="control-actions">
                  <button type="button" id="play-toggle" class="secondary control-btn" aria-pressed="${state.playing}" aria-label="${state.playing ? "Pause animation" : "Play animation"}">${state.playing ? "Pause" : "Play"}</button>
                  <button type="button" id="reset-playback" class="text-button">Restart</button>
                  <button type="button" id="reset-view" class="text-button">Reset view</button>
                </div>
              </div>
            </div>
          </section>
          <section class="problem-panel" aria-labelledby="question-title">
            <div class="question-top">
              <span class="question-number">${escape(p.title)}${p.source ? renderSourceTag(p.source) : ""}</span>
              <span class="question-index">Q${state.questionIndex + 1}</span>
            </div>
            <h2 id="question-title">${richMath(p.prompt)}</h2>
            <div class="choices" role="radiogroup" aria-labelledby="question-title"${state.checked ? ' aria-describedby="question-feedback"' : ""}>
              ${p.choices.map((option, index) => {
                const isCorrect = state.checked && option.id === p.correctId;
                const isIncorrect = state.checked && state.selected === option.id && option.id !== p.correctId;
                const statusMark = isCorrect
                  ? '<span class="choice-status" aria-hidden="true">✓</span>'
                  : isIncorrect
                    ? '<span class="choice-status" aria-hidden="true">✕</span>'
                    : "";
                const longChoice = String(option.latex || "").length >= 48;
                return `
                <button type="button"
                  class="choice ${longChoice ? "choice-long" : ""} ${state.selected === option.id ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isIncorrect ? "incorrect" : ""}"
                  data-choice="${option.id}"
                  role="radio"
                  aria-label="${escape(choiceAriaLabel(option, index, p))}"
                  aria-checked="${state.selected === option.id}"
                  ${state.checked ? "disabled" : ""}>
                  <span class="choice-letter" aria-hidden="true">${"ABCD"[index]}</span>
                  <span class="choice-math">${tex(option.latex)}</span>
                  ${statusMark}
                </button>`;
              }).join("")}
            </div>
            <div class="question-actions">
              <button type="button" id="check" class="primary" ${!state.selected || state.checked ? "disabled" : ""}>Check answer</button>
              ${state.checked ? '<button type="button" id="next" class="secondary">Next question →</button>' : ""}
            </div>
            ${state.checked ? `
              <div class="feedback ${correct ? "positive" : "negative"}" id="question-feedback" role="status" aria-live="polite">
                <p class="feedback-message"><strong>${correct ? "Correct" : "Incorrect"}</strong> — ${correct
                  ? "See the worked solution below."
                  : "The correct choice is highlighted. Work the steps below."}</p>
              </div>
            ` : ""}
            ${state.showSolution ? renderSolution(p, correct) : ""}
          </section>
        </div>
        ${renderProblemNavigator()}
      </main>
    </div>`;

  if (existingVisual) document.querySelector(".visual-panel").replaceWith(existingVisual);
  bindPracticeEvents(Boolean(existingVisual));
  if (!existingVisual) {
    state.slices = Math.min(state.slices, maxStrips());
    mountScene(p);
    bindStepJumpControls();
  }

  const motion = scrollBehavior();

  if (state.showSolution) {
    requestAnimationFrame(() => {
      const panel = document.querySelector("#solution-panel");
      if (!panel) return;
      panel.scrollIntoView({ behavior: motion, block: "start" });
      panel.focus({ preventScroll: true });
    });
  } else if (options.focusChoice) {
    requestAnimationFrame(() => {
      document.querySelector(`[data-choice="${options.focusChoice}"]`)?.focus();
    });
  }

}

function bindPracticeEvents(preserveVisual = false) {
  document.querySelector("#go-home")?.addEventListener("click", goLanding);
  document.querySelectorAll("[data-question-nav]").forEach(button => {
    button.addEventListener("click", () => {
      goToQuestion(state.questionIndex + (button.dataset.questionNav === "next" ? 1 : -1));
    });
  });
  document.querySelectorAll("[data-question-band]").forEach(button => {
    button.addEventListener("click", () => {
      const start = Number(button.dataset.questionBand);
      const end = Math.min(start + QUESTION_BAND, QUESTIONS_PER_TOPIC);
      // Stay on current question if already in this band; otherwise open the band start.
      if (state.questionIndex < start || state.questionIndex >= end) {
        goToQuestion(start);
      }
    });
  });
  document.querySelectorAll("[data-question]").forEach(button => {
    button.addEventListener("click", () => goToQuestion(Number(button.dataset.question)));
  });
  document.querySelector("#problem-jump")?.addEventListener("submit", event => {
    event.preventDefault();
    const input = document.querySelector("#problem-jump-input");
    if (!input) return;
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) {
      input.focus();
      input.select();
      return;
    }
    goToQuestion(Math.round(raw) - 1);
  });
  const choiceButtons = [...document.querySelectorAll("[data-choice]")];
  choiceButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const id = button.dataset.choice;
      state.selected = id;
      renderPractice({ preserveVisual: true, focusChoice: id });
    });
    button.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + choiceButtons.length) % choiceButtons.length;
      const nextId = choiceButtons[nextIndex].dataset.choice;
      state.selected = nextId;
      renderPractice({ preserveVisual: true, focusChoice: nextId });
    });
  });
  if (!preserveVisual) {
    document.querySelectorAll("[data-method]").forEach(button => {
      button.addEventListener("click", () => {
        const nextAlternate = button.dataset.method === "washers";
        if (nextAlternate === state.alternate) return;
        state.alternate = nextAlternate;
        state.method = button.dataset.method;
        const problem = state.problem;
        applyDualMethodUi(problem);
        const visualSpec = resolveVisualSpec(problem, { alternate: state.alternate });
        if (visualSpec && document.querySelector(".legacy-animation")) {
          state.vizLoading = true;
          state.vizError = null;
          const host = document.querySelector("#three-host");
          const errorEl = document.querySelector("#viz-error");
          host?.classList.add("is-loading");
          host?.classList.remove("has-error");
          host?.setAttribute("aria-busy", "true");
          if (errorEl) {
            errorEl.hidden = true;
            errorEl.setAttribute("aria-hidden", "true");
          }
          postToScene({ action: "setExample", spec: visualSpec });
          syncSceneControls();
        } else {
          mountScene(problem);
          bindStepJumpControls();
        }
      });
    });
    document.querySelector("#slices")?.addEventListener("input", event => {
      state.slices = Number(event.target.value);
      const output = document.querySelector("#slices-out");
      if (output) output.textContent = state.slices;
      syncSliderAria(event.target, `${state.slices} strips`);
      postToScene({ action: "setShells", value: state.slices });
    });
    document.querySelector("#playback-speed")?.addEventListener("input", event => {
      state.playbackSpeed = Number(event.target.value);
      const output = document.querySelector("#speed-out");
      if (output) output.textContent = `${state.playbackSpeed.toFixed(2)}×`;
      syncSliderAria(event.target, `${state.playbackSpeed.toFixed(2)} times speed`);
      postToScene({ action: "setSpeed", value: state.playbackSpeed });
    });
    document.querySelector("#playback-progress")?.addEventListener("input", event => {
      state.playbackProgress = Number(event.target.value);
      state.playing = false;
      const output = document.querySelector("#progress-out");
      if (output) output.textContent = `${Math.round(state.playbackProgress * 100)}%`;
      syncSliderAria(event.target, `${Math.round(state.playbackProgress * 100)} percent`);
      syncPlayButton();
      postToScene({ action: "setProgress", value: state.playbackProgress });
    });
    document.querySelector("#play-toggle")?.addEventListener("click", () => {
      state.playing = !state.playing;
      syncPlayButton();
      postToScene({ action: state.playing ? "play" : "pause" });
    });
    document.querySelector("#reset-playback")?.addEventListener("click", () => {
      state.playbackProgress = 0;
      state.playing = false;
      const progressInput = document.querySelector("#playback-progress");
      const progressOut = document.querySelector("#progress-out");
      if (progressInput) progressInput.value = "0";
      if (progressOut) progressOut.textContent = "0%";
      syncPlayButton();
      postToScene({ action: "resetPlayback" });
    });
    document.querySelector("#reset-view")?.addEventListener("click", () => sceneController?.reset());
    document.querySelector("#viz-retry")?.addEventListener("click", () => {
      if (state.problem) {
        state.vizError = null;
        mountScene(state.problem);
        bindStepJumpControls();
      }
    });
  }
  document.querySelector("#check")?.addEventListener("click", () => {
    const isCorrect = state.selected === state.problem.correctId;
    state.checked = true;
    state.showSolution = true;
    state.problem.result = isCorrect;
    state.attempts += 1;
    if (isCorrect) state.correct += 1;
    saveQuestionState();
    saveProgress();
    renderPractice({ preserveVisual: true });
  });
  document.querySelector("#next")?.addEventListener("click", () => {
    goToQuestion((state.questionIndex + 1) % QUESTIONS_PER_TOPIC);
  });
}

let sceneController;

function hideVizLoading() {
  state.vizLoading = false;
  state.vizError = null;
  const host = document.querySelector("#three-host");
  const loader = document.querySelector("#viz-loading");
  const errorEl = document.querySelector("#viz-error");
  if (host) {
    host.classList.remove("is-loading", "has-error");
    host.setAttribute("aria-busy", "false");
  }
  if (loader) loader.setAttribute("aria-hidden", "true");
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.setAttribute("aria-hidden", "true");
  }
}

function showVizError(message) {
  state.vizLoading = false;
  state.vizError = message || "Couldn't load the visualization.";
  const host = document.querySelector("#three-host");
  const loader = document.querySelector("#viz-loading");
  const errorEl = document.querySelector("#viz-error");
  const errorText = errorEl?.querySelector(".viz-error-text");
  if (host) {
    host.classList.remove("is-loading");
    host.classList.add("has-error");
    host.setAttribute("aria-busy", "false");
  }
  if (loader) loader.setAttribute("aria-hidden", "true");
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.setAttribute("aria-hidden", "false");
    if (errorText) errorText.textContent = state.vizError;
  }
}

function updateAnimationStep(step, text) {
  const nextStep = step || state.animationStep;
  const nextText = text || state.animationStepText;
  if (nextStep === state.animationStep && nextText === state.animationStepText) {
    // still refresh active styling if step buttons were rebuilt
    document.querySelectorAll(".step-item").forEach(item => {
      const active = item.dataset.step === state.animationStep;
      item.classList.toggle("active", active);
      item.setAttribute("aria-current", active ? "step" : "false");
    });
    return;
  }
  state.animationStep = nextStep;
  state.animationStepText = nextText;
  document.querySelectorAll(".step-item").forEach(item => {
    const active = item.dataset.step === state.animationStep;
    item.classList.toggle("active", active);
    item.setAttribute("aria-current", active ? "step" : "false");
  });
  const detail = document.querySelector("#step-detail");
  if (detail) detail.textContent = state.animationStepText;
}

function postToScene(payload) {
  const frame = document.querySelector(".legacy-animation");
  frame?.contentWindow?.postMessage({ type: "integral-studio", ...payload }, SCENE_ORIGIN);
}

function syncSceneControls() {
  if (prefersReducedMotion()) state.playing = false;
  postToScene({ action: "setPalette", palette: vizPaletteFromCss() });
  postToScene({ action: "setShells", value: state.slices });
  postToScene({ action: "setSpeed", value: state.playbackSpeed });
  postToScene({ action: "setProgress", value: state.playbackProgress });
  postToScene({ action: state.playing ? "play" : "pause" });
  syncPlayButton();
}

function encodeVisualConfig(spec) {
  const json = JSON.stringify(spec);
  return encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
}

function encodePaletteParam(palette) {
  try {
    return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(palette)))));
  } catch {
    return "";
  }
}

function mountScene(problem) {
  sceneController?.dispose();
  const host = document.querySelector("#three-host");
  if (!host) return;
  state.animationStep = "region";
  state.animationStepText = "Sketch the bounded region.";
  state.vizLoading = true;
  state.vizError = null;
  state.slices = Math.min(state.slices, maxStrips());
  host.classList.add("is-loading");
  host.classList.remove("has-error");
  host.setAttribute("aria-busy", "true");
  host.querySelector(".legacy-animation")?.remove();
  let loader = host.querySelector("#viz-loading");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "viz-loading";
    loader.className = "viz-loading";
    loader.innerHTML = '<span class="viz-loading-bar" aria-hidden="true"></span><span class="viz-loading-text">Loading visualization…</span>';
    host.prepend(loader);
  }
  loader.setAttribute("aria-hidden", "false");
  let errorEl = host.querySelector("#viz-error");
  if (!errorEl) {
    errorEl = document.createElement("div");
    errorEl.id = "viz-error";
    errorEl.className = "viz-error";
    errorEl.setAttribute("role", "alert");
    errorEl.innerHTML = '<p class="viz-error-text">Couldn\'t load the visualization.</p><button type="button" id="viz-retry" class="secondary control-btn">Try again</button>';
    host.append(errorEl);
    errorEl.querySelector("#viz-retry")?.addEventListener("click", () => {
      if (state.problem) mountScene(state.problem);
    });
  }
  errorEl.hidden = true;
  errorEl.setAttribute("aria-hidden", "true");

  const legacyModes = { area: "area", volume: "volume", centroid: "centroid", curve: "arc", surface: "surface", inertia: "inertia" };
  const visualSpec = resolveVisualSpec(problem, { alternate: state.alternate });
  const frame = document.createElement("iframe");
  const { a = 1, b = 1, n = 1 } = problem.given || {};
  const palette = vizPaletteFromCss();
  const canvasColor = palette.canvas || "ede6d8";
  let configParam = "";
  if (visualSpec) {
    try {
      configParam = `&config=${encodeVisualConfig(visualSpec)}`;
    } catch {
      configParam = "";
    }
  }
  const paletteParam = encodePaletteParam(palette);
  const vizLabel = visualLabel(problem);
  frame.src = `/legacy-animation.html?example=dynamic&mode=${legacyModes[problem.visual] || "area"}&a=${a}&b=${b}&n=${n}&method=${state.alternate ? "washers" : "shells"}&shells=${state.slices}&speed=${state.playbackSpeed}&canvas=${canvasColor}${paletteParam ? `&palette=${paletteParam}` : ""}${configParam}`;
  frame.title = vizLabel;
  frame.tabIndex = 0;
  frame.className = "legacy-animation";
  frame.setAttribute("aria-label", `${vizLabel}. Interactive 3D diagram. Use the camera controls below, or focus the diagram and use arrow keys, plus/minus, and R.`);
  host.append(frame);

  let loadTimedOut = false;
  const loadTimer = window.setTimeout(() => {
    if (state.vizLoading) {
      loadTimedOut = true;
      showVizError("Visualization took too long to load. Check your connection and try again.");
    }
  }, 8000);

  const markReady = () => {
    if (loadTimedOut && state.vizError) return;
    window.clearTimeout(loadTimer);
    hideVizLoading();
  };

  const onLoad = () => {
    postToScene({ action: "setPalette", palette });
    if (visualSpec) postToScene({ action: "setExample", spec: visualSpec });
    syncSceneControls();
  };
  frame.addEventListener("load", onLoad);
  frame.addEventListener("error", () => {
    window.clearTimeout(loadTimer);
    showVizError("Couldn't load the visualization. Try again.");
  });

  const onMessage = event => {
    if (event.origin !== SCENE_ORIGIN) return;
    const data = event.data;
    if (!data || data.type !== "integral-studio") return;
    if (data.action === "ready" || data.action === "progress" || data.action === "step") {
      markReady();
    }
    if (data.action === "error") {
      window.clearTimeout(loadTimer);
      const message = typeof data.message === "string" && data.message.trim()
        ? data.message.trim().slice(0, 240)
        : "Couldn't render the visualization.";
      showVizError(message);
      return;
    }
    if (data.action === "progress") {
      const nextProgress = Number(data.progress) || 0;
      const nextPlaying = prefersReducedMotion() ? false : Boolean(data.playing);
      const progressInput = document.querySelector("#playback-progress");
      const progressOut = document.querySelector("#progress-out");
      if (Math.abs(nextProgress - state.playbackProgress) >= 0.001 || nextPlaying !== state.playing) {
        state.playbackProgress = nextProgress;
        state.playing = nextPlaying;
        if (progressInput && document.activeElement !== progressInput) {
          progressInput.value = String(state.playbackProgress);
          syncSliderAria(progressInput, `${Math.round(state.playbackProgress * 100)} percent`);
        }
        if (progressOut) progressOut.textContent = `${Math.round(state.playbackProgress * 100)}%`;
        syncPlayButton();
      }
      return;
    }
    if (data.action === "step") {
      const step = typeof data.step === "string" ? data.step.slice(0, 32) : undefined;
      const text = typeof data.text === "string" ? data.text.slice(0, 240) : undefined;
      updateAnimationStep(step, text);
    }
  };
  window.addEventListener("message", onMessage);

  sceneController = {
    dispose: () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", onLoad);
      frame.remove();
    },
    reset: () => postToScene({ action: "resetView" }),
    post: postToScene
  };
}

function rebuildVisual() {
  mountScene(state.problem);
}

function render(options) {
  if (state.screen === "landing") renderLanding();
  else renderPractice(options);
}

window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
  if (!event.matches) return;
  state.playing = false;
  syncPlayButton();
  postToScene({ action: "pause" });
});

loadProgress();
render();
