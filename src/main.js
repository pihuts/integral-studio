/**
 * Practice app shell — wires problem module, view, and SceneController.
 * Domain logic lives in problemService / materializeVisual / animationTimeline.
 */
import "./style.css";
import {
  TOPICS,
  QUESTIONS_PER_TOPIC,
  loadBriggsBank,
  loadProblem,
  visualLabel as problemVisualLabel
} from "./problemService.js";
import {
  materializeVisualExample,
  materializeVisualSpec,
  problemHasDualMethod
} from "./materializeVisual.js";
import { STEP_PROGRESS, animationStepsForMethod } from "./animationTimeline.js";
import { createSceneController } from "./sceneController.js";

let katex;
let practiceDependenciesPromise;

function loadPracticeDependencies() {
  if (!practiceDependenciesPromise) {
    practiceDependenciesPromise = Promise.all([
      loadBriggsBank(),
      import("katex").then(module => {
        katex = module.default;
      }),
      import("katex/dist/katex.min.css")
    ]);
  }
  return practiceDependenciesPromise;
}

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
  vizError: null,
  practiceLoading: false,
  practiceError: null
};

const SCENE_ORIGIN = window.location.origin;
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarsePointer = () => window.matchMedia("(pointer: coarse)").matches;
const isNarrowViewport = () => window.matchMedia("(max-width: 600px)").matches;
const isCompactViewport = () => window.matchMedia("(max-width: 860px)").matches;
const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");
state.playing = !prefersReducedMotion();

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
  const method =
    materializeVisualSpec(problem, { alternate: state.alternate })?.method ||
    problem?.visual ||
    "area";
  return animationStepsForMethod(method, problem?.visual);
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

const QUESTION_BAND = 10;

function questionBandStart(index) {
  return Math.floor(index / QUESTION_BAND) * QUESTION_BAND;
}

function renderProblemNavigator() {
  const current = state.questionIndex;
  const bandStart = questionBandStart(current);
  const bandEnd = Math.min(bandStart + QUESTION_BAND, QUESTIONS_PER_TOPIC);

  const pills = Array.from({ length: bandEnd - bandStart }, (_, offset) => {
    const index = bandStart + offset;
    const status = problemStatus(index);
    const statusWord = status === true ? ", correct" : status === false ? ", incorrect" : "";
    return `<button type="button" class="problem-pill ${index === current ? "active" : ""} ${status === true ? "correct" : ""} ${status === false ? "incorrect" : ""}" data-question="${index}" aria-label="Question ${index + 1} of ${QUESTIONS_PER_TOPIC}${statusWord}" aria-current="${index === current ? "step" : "false"}"><span class="problem-pill-num">${index + 1}</span>${pillStatusIcon(status)}</button>`;
  }).join("");

  return `
    <nav class="problem-navigator" aria-label="Questions">
      <button type="button" class="secondary problem-nav-step" data-question-nav="previous" ${current === 0 ? "disabled" : ""} aria-label="Previous question">←</button>
      <div class="problem-pills" role="group" aria-label="Questions ${bandStart + 1} to ${bandEnd}">${pills}</div>
      <button type="button" class="secondary problem-nav-step" data-question-nav="next" ${current === QUESTIONS_PER_TOPIC - 1 ? "disabled" : ""} aria-label="Next question">→</button>
      <span class="sr-only" aria-live="polite">Question ${current + 1} of ${QUESTIONS_PER_TOPIC}</span>
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
      sceneHandle?.post({ action: "setProgress", value: progress });
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

const escape = value =>
  String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const normalizeLatex = value => String(value).replace(/\\\\/g, "\\");
const tex = (value, display = false) =>
  katex.renderToString(normalizeLatex(value), {
    displayMode: display,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    maxSize: 20,
    maxExpand: 500
  });

const richMath = value => {
  const text = String(value ?? "");
  const parts = [];
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(escape(text.slice(last, match.index)));
    const display = match[1] != null || match[2] != null;
    const body = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    parts.push(tex(body, display));
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(escape(text.slice(last)));
  return parts.join("") || escape(text);
};

const mathDescription = value =>
  normalizeLatex(value)
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function saveProgress() {
  localStorage.setItem(
    "integral-studio-progress",
    JSON.stringify({
      topic: state.topic,
      correct: state.correct,
      attempts: state.attempts
    })
  );
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem("integral-studio-progress") || "{}");
    if (saved.topic && TOPICS[saved.topic]) state.topic = saved.topic;
    if (typeof saved.correct === "number") state.correct = saved.correct;
    if (typeof saved.attempts === "number") state.attempts = saved.attempts;
  } catch {
    /* optional */
  }
}

function problemKey() {
  return `${state.topic}:${state.questionIndex}`;
}

function currentProblem() {
  const key = problemKey();
  return state.problemCache[key] || (state.problemCache[key] = loadProblem(state.topic, state.questionIndex));
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
  render({ focusChoice: state.problem.choices?.[0]?.id });
}

async function startPractice() {
  state.practiceLoading = true;
  state.practiceError = null;
  renderLanding();
  try {
    await loadPracticeDependencies();
  } catch {
    practiceDependenciesPromise = null;
    state.practiceLoading = false;
    state.practiceError = "Practice could not load. Check your connection and try again.";
    renderLanding();
    return;
  }
  state.practiceLoading = false;
  state.screen = "practice";
  state.questionIndex = 0;
  state.problemCache = {};
  state.problem = currentProblem();
  Object.assign(state, { selected: null, checked: false, showSolution: false });
  saveProgress();
  render({ focusChoice: state.problem.choices?.[0]?.id });
}

function goLanding() {
  saveQuestionState();
  state.screen = "landing";
  render();
}

function visualLabel(problem) {
  return problemVisualLabel(problem, { alternate: state.alternate });
}

function solutionMethodLabel(problem, alternate) {
  const spec = materializeVisualSpec(problem, { alternate });
  const vertical = spec?.orientation === "vertical";
  const shells = spec?.method?.startsWith("shell");
  const slice = vertical ? "Vertical strips" : "Horizontal strips";
  const sweep = shells ? "shells" : "disks or washers";
  return `${slice} → ${sweep}`;
}

function equationsForProblem(problem) {
  if (Array.isArray(problem?.equations) && problem.equations.length) {
    return problem.equations;
  }
  const method =
    materializeVisualSpec(problem, { alternate: state.alternate })?.method ||
    problem?.visualParams?.method ||
    problem?.visual ||
    state.topic ||
    "";
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
  const rows = equations
    .map(
      eq => `
    <li class="solution-equation-item">
      <div class="solution-equation-math">${tex(eq, true)}</div>
    </li>`
    )
    .join("");
  return `
    <aside class="solution-equations" aria-label="Equations to use">
      <p class="solution-equations-label">Equations to use</p>
      <ol class="solution-equations-list">${rows}</ol>
    </aside>`;
}

function renderSolutionSteps(steps, startIndex = 1) {
  return steps
    .map((item, index) => {
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
    })
    .join("");
}

function renderSolution(p, correct) {
  const dual = problemHasDualMethod(p);
  const primarySteps = state.alternate && p.alternateSteps?.length ? p.alternateSteps : p.steps;
  const secondarySteps = state.alternate ? p.steps : p.alternateSteps;
  const secondaryLabel = solutionMethodLabel(p, !state.alternate);
  const equationsHtml = renderEquationsBox(equationsForProblem(p));
  const stepsHtml = renderSolutionSteps(primarySteps);
  const alternateHtml =
    dual && secondarySteps?.length
      ? `
    <div class="solution-method-block">
      <h3 class="solution-method-title">Alternate approach: ${secondaryLabel}</h3>
      <p class="solution-method-note">Same region and axis — switch the slice direction. Toggle the control above to animate this setup.</p>
      <ol class="solution-steps solution-steps-alt">${renderSolutionSteps(secondarySteps, primarySteps.length + 1)}</ol>
    </div>`
      : "";

  return `
    <section class="solution-panel is-open" id="solution-panel" aria-labelledby="solution-title" tabindex="-1">
      <div class="solution-banner ${correct ? "is-correct" : "is-incorrect"}">
        <h2 id="solution-title">Worked solution</h2>
      </div>
      ${equationsHtml}
      <ol class="solution-steps">${stepsHtml}</ol>
      ${alternateHtml}
      ${
        p.finalAnswer
          ? `
        <div class="solution-answer" role="region" aria-label="Final answer">
          <p class="solution-answer-label">Final answer</p>
          <div class="solution-answer-math">${tex(p.finalAnswer, true)}</div>
        </div>`
          : ""
      }
      ${
        p.insight
          ? `
        <aside class="solution-insight" aria-label="Key takeaway">
          <p class="solution-insight-label">Remember</p>
          <p class="solution-insight-text">${richMath(p.insight)}</p>
        </aside>`
          : ""
      }
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
          <div class="topic-grid" role="radiogroup" aria-labelledby="topic-heading">
            ${Object.entries(TOPICS)
              .map(
                ([id, item]) => `
              <button type="button" class="topic-card ${state.topic === id ? "selected" : ""}" role="radio" aria-checked="${state.topic === id}" tabindex="${state.topic === id ? "0" : "-1"}" data-topic="${id}">
                <span class="topic-card-icon" aria-hidden="true">${item.icon}</span>
                <span class="topic-card-label">${item.label}</span>
                <span class="topic-card-desc">${escape(item.description)}</span>
              </button>
            `
              )
              .join("")}
          </div>
        </section>
        <button type="button" id="start-practice" class="primary landing-start" ${state.practiceLoading ? "disabled" : ""} aria-busy="${state.practiceLoading}">${state.practiceLoading ? "Loading practice..." : "Start practice"}</button>
        ${state.practiceError ? `<p class="load-error" role="alert">${escape(state.practiceError)}</p>` : ""}
      </main>
    </div>`;

  const topicButtons = [...document.querySelectorAll("[data-topic]")];
  const selectTopic = (id, focus = false) => {
    state.topic = id;
    renderLanding();
    if (focus) requestAnimationFrame(() => document.querySelector(`[data-topic="${id}"]`)?.focus());
  };
  topicButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => {
      selectTopic(btn.dataset.topic, true);
    });
    btn.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home" || event.key === "End") {
        const next = topicButtons[event.key === "Home" ? 0 : topicButtons.length - 1];
        selectTopic(next.dataset.topic, true);
        return;
      }
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const next = topicButtons[(index + direction + topicButtons.length) % topicButtons.length];
      selectTopic(next.dataset.topic, true);
    });
  });
  document.querySelector("#start-practice")?.addEventListener("click", startPractice);
}

function renderPractice(options = {}) {
  const { preserveVisual = false } = options;
  const existingVisual = preserveVisual ? document.querySelector(".visual-panel") : null;
  const topic = TOPICS[state.topic];
  const p = state.problem || (state.problem = currentProblem());
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
              <div class="viz-loading" id="viz-loading" role="status" aria-live="polite" aria-hidden="${state.vizLoading && !state.vizError ? "false" : "true"}">
                <span class="viz-loading-bar" aria-hidden="true"></span>
                <span class="viz-loading-text">Loading visualization…</span>
              </div>
              <div class="viz-error" id="viz-error" role="alert" aria-hidden="${state.vizError ? "false" : "true"}"${state.vizError ? "" : " hidden"}>
                <p class="viz-error-text">${escape(state.vizError || "Couldn't load the visualization.")}</p>
                <button type="button" id="viz-retry" class="secondary control-btn">Try again</button>
              </div>
            </div>
            <div class="model-controls">
              ${
                problemHasDualMethod(p)
                  ? `
                <div class="segmented" role="group" aria-label="Slice direction">
                  <button type="button" class="${!state.alternate ? "selected" : ""}" data-method="shells" aria-pressed="${!state.alternate}" aria-label="Vertical strips">Vertical<span class="label-rest"> strips</span></button>
                  <button type="button" class="${state.alternate ? "selected" : ""}" data-method="washers" aria-pressed="${state.alternate}" aria-label="Horizontal strips">Horizontal<span class="label-rest"> strips</span></button>
                </div>
              `
                  : ""
              }
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
          <section class="problem-panel${state.showSolution ? " solution-open" : ""}" aria-labelledby="question-title">
            <div class="question-top">
              <span class="question-number">${escape(p.title)}</span>
              <span class="question-index">Q${state.questionIndex + 1}</span>
            </div>
            <h1 id="question-title">${richMath(p.prompt)}</h1>
            <div class="choices" role="radiogroup" aria-labelledby="question-title"${state.checked ? ' aria-describedby="question-feedback"' : ""}>
              ${p.choices
                .map((option, index) => {
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
                  tabindex="${state.selected === option.id || (!state.selected && index === 0) ? "0" : "-1"}"
                  ${state.checked ? "disabled" : ""}>
                  <span class="choice-letter" aria-hidden="true">${"ABCD"[index]}</span>
                  <span class="choice-math">${tex(option.latex)}</span>
                  ${statusMark}
                </button>`;
                })
                .join("")}
            </div>
            ${
              state.checked
                ? `
              <div class="feedback ${correct ? "positive" : "negative"}" id="question-feedback" role="status" aria-live="polite">
                <p class="feedback-message"><strong>${correct ? "Correct" : "Incorrect"}</strong> — ${
                  correct
                    ? "Worked solution below."
                    : "Correct choice highlighted. Steps below."
                }</p>
              </div>
            `
                : ""
            }
            <div class="question-actions">
              ${
                state.checked
                  ? `<button type="button" id="next" class="primary">Next question →</button>`
                  : `<button type="button" id="check" class="primary" ${!state.selected ? "disabled" : ""}>Check answer</button>`
              }
            </div>
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
      const feedback = document.querySelector("#question-feedback");
      const panel = document.querySelector("#solution-panel");
      // Keep choice + feedback in view; only jump to solution on compact layouts.
      const target = isCompactViewport() ? panel || feedback : feedback || panel;
      if (target) {
        target.scrollIntoView({
          behavior: isCompactViewport() ? "auto" : motion,
          block: "nearest"
        });
      }
      panel?.focus({ preventScroll: true });
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
  document.querySelectorAll("[data-question]").forEach(button => {
    button.addEventListener("click", () => goToQuestion(Number(button.dataset.question)));
  });
  const choiceButtons = [...document.querySelectorAll("[data-choice]")];
  choiceButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const id = button.dataset.choice;
      state.selected = id;
      renderPractice({ preserveVisual: true, focusChoice: id });
    });
    button.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home" || event.key === "End") {
        const next = choiceButtons[event.key === "Home" ? 0 : choiceButtons.length - 1];
        const nextId = next.dataset.choice;
        state.selected = nextId;
        renderPractice({ preserveVisual: true, focusChoice: nextId });
        return;
      }
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
        const visualSpec = materializeVisualSpec(problem, { alternate: state.alternate });
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
          sceneHandle?.post({ action: "setExample", spec: visualSpec });
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
      sceneHandle?.post({ action: "setShells", value: state.slices });
    });
    document.querySelector("#playback-speed")?.addEventListener("input", event => {
      state.playbackSpeed = Number(event.target.value);
      const output = document.querySelector("#speed-out");
      if (output) output.textContent = `${state.playbackSpeed.toFixed(2)}×`;
      syncSliderAria(event.target, `${state.playbackSpeed.toFixed(2)} times speed`);
      sceneHandle?.post({ action: "setSpeed", value: state.playbackSpeed });
    });
    document.querySelector("#playback-progress")?.addEventListener("input", event => {
      state.playbackProgress = Number(event.target.value);
      state.playing = false;
      const output = document.querySelector("#progress-out");
      if (output) output.textContent = `${Math.round(state.playbackProgress * 100)}%`;
      syncSliderAria(event.target, `${Math.round(state.playbackProgress * 100)} percent`);
      syncPlayButton();
      sceneHandle?.post({ action: "setProgress", value: state.playbackProgress });
    });
    document.querySelector("#play-toggle")?.addEventListener("click", () => {
      state.playing = !state.playing;
      syncPlayButton();
      sceneHandle?.post({ action: state.playing ? "play" : "pause" });
    });
    document.querySelector("#reset-playback")?.addEventListener("click", () => {
      state.playbackProgress = 0;
      state.playing = false;
      const progressInput = document.querySelector("#playback-progress");
      const progressOut = document.querySelector("#progress-out");
      if (progressInput) progressInput.value = "0";
      if (progressOut) progressOut.textContent = "0%";
      syncPlayButton();
      sceneHandle?.post({ action: "resetPlayback" });
    });
    document.querySelector("#reset-view")?.addEventListener("click", () => sceneHandle?.reset());
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

/** Active iframe controller handle from createSceneController().mount */
let sceneHandle = null;

const sceneController = createSceneController({
  origin: SCENE_ORIGIN,
  getPalette: vizPaletteFromCss,
  onReady: () => hideVizLoading(),
  onError: message => showVizError(message),
  onStep: (step, text) => updateAnimationStep(step, text),
  onProgress: (nextProgress, nextPlaying) => {
    const playing = prefersReducedMotion() ? false : nextPlaying;
    const progressInput = document.querySelector("#playback-progress");
    const progressOut = document.querySelector("#progress-out");
    if (Math.abs(nextProgress - state.playbackProgress) >= 0.001 || playing !== state.playing) {
      state.playbackProgress = nextProgress;
      state.playing = playing;
      if (progressInput && document.activeElement !== progressInput) {
        progressInput.value = String(state.playbackProgress);
        syncSliderAria(progressInput, `${Math.round(state.playbackProgress * 100)} percent`);
      }
      if (progressOut) progressOut.textContent = `${Math.round(state.playbackProgress * 100)}%`;
      syncPlayButton();
    }
  },
  onSyncControls: () => syncSceneControls()
});

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

function syncSceneControls() {
  if (prefersReducedMotion()) state.playing = false;
  sceneHandle?.post({ action: "setPalette", palette: vizPaletteFromCss() });
  sceneHandle?.post({ action: "setShells", value: state.slices });
  sceneHandle?.post({ action: "setSpeed", value: state.playbackSpeed });
  sceneHandle?.post({ action: "setProgress", value: state.playbackProgress });
  if (state.playing) sceneHandle?.post({ action: "play" });
  else sceneHandle?.post({ action: "pause" });
  syncPlayButton();
}

function mountScene(problem) {
  sceneHandle?.dispose();
  sceneHandle = null;
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
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.innerHTML =
      '<span class="viz-loading-bar" aria-hidden="true"></span><span class="viz-loading-text">Loading visualization…</span>';
    host.prepend(loader);
  }
  loader.setAttribute("aria-hidden", "false");
  let errorEl = host.querySelector("#viz-error");
  if (!errorEl) {
    errorEl = document.createElement("div");
    errorEl.id = "viz-error";
    errorEl.className = "viz-error";
    errorEl.setAttribute("role", "alert");
    errorEl.innerHTML =
      '<p class="viz-error-text">Couldn\'t load the visualization.</p><button type="button" id="viz-retry" class="secondary control-btn">Try again</button>';
    host.append(errorEl);
    errorEl.querySelector("#viz-retry")?.addEventListener("click", () => {
      if (state.problem) mountScene(state.problem);
    });
  }
  errorEl.hidden = true;
  errorEl.setAttribute("aria-hidden", "true");

  const legacyModes = {
    area: "area",
    volume: "volume",
    centroid: "centroid",
    curve: "arc",
    surface: "surface",
    inertia: "inertia"
  };
  const { spec: visualSpec } = materializeVisualExample(problem, { alternate: state.alternate });
  const { a = 1, b = 1, n = 1 } = problem.given || {};
  const palette = vizPaletteFromCss();
  const canvasColor = palette.canvas || "ede6d8";
  const vizLabel = visualLabel(problem);

  sceneHandle = sceneController.mount(host, {
    visualSpec,
    mode: legacyModes[problem.visual] || "area",
    a,
    b,
    n,
    alternate: state.alternate,
    shells: state.slices,
    speed: state.playbackSpeed,
    title: vizLabel,
    canvasColor,
    palette
  });
}

function render(options) {
  if (state.screen === "landing") renderLanding();
  else renderPractice(options);
}

window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
  if (!event.matches) return;
  state.playing = false;
  syncPlayButton();
  sceneHandle?.post({ action: "pause" });
});

loadProgress();
render();
