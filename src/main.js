/**
 * Practice app shell — view adapter over Practice session + Scene host.
 * Domain: Bank · PreparedProblem · Scene · animationTimeline.
 */
import "./style.css";
import {
  TOPICS,
  QUESTIONS_PER_TOPIC,
  loadBriggsBank,
  loadProblemRow
} from "./problemService.js";
import { STEP_PROGRESS, animationStepsForMethod } from "./animationTimeline.js";
import {
  state,
  prefersReducedMotion,
  isCompactViewport,
  scrollBehavior,
  maxStrips,
  cameraControlHint,
  vizStageInstructions,
  loadProgress
} from "./practiceState.js";
import { preparedHasDualMethod } from "./preparedProblem.js";
import { createPracticeSession } from "./practiceSession.js";
import { setKatex, escape, tex, richMath, formatSolutionBody, mathDescription } from "./mathRender.js";
import { equationsForProblem } from "./equations.js";
import { sourceLinkHtml } from "./references.js";
import {
  initSceneHost,
  mountScene,
  applyDualMethodVisual,
  getSceneHandle
} from "./sceneHost.js";

let practiceDependenciesPromise;

function loadPracticeDependencies() {
  if (!practiceDependenciesPromise) {
    practiceDependenciesPromise = Promise.all([
      loadBriggsBank(),
      import("katex").then(module => {
        setKatex(module.default);
      }),
      import("katex/dist/katex.min.css")
    ]);
  }
  return practiceDependenciesPromise;
}

const SCENE_ORIGIN = window.location.origin;

const session = createPracticeSession({ loadProblemRow });

function animationStepsFor(problem) {
  const method = session.animationMethod() || problem?.visual || "area";
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

function renderProblemNavigator() {
  const current = state.questionIndex;
  const action = state.checked
    ? `<button type="button" id="next" class="primary problem-nav-action">Next</button>`
    : `<button type="button" id="check" class="primary problem-nav-action" ${!state.selected ? "disabled" : ""}>Check</button>`;

  return `
    <nav class="problem-navigator" aria-label="Questions">
      <button type="button" class="secondary problem-nav-step" data-question-nav="previous" ${current === 0 ? "disabled" : ""} aria-label="Previous question">←</button>
      <p class="problem-nav-position" aria-live="polite">
        <span class="problem-nav-current">${current + 1}</span>
        <span class="problem-nav-of">of</span>
        <span class="problem-nav-total">${QUESTIONS_PER_TOPIC}</span>
      </p>
      ${action}
    </nav>`;
}

function renderStepTrack(activeStep, problem) {
  const steps = animationStepsFor(problem);
  return `<ol class="step-track" aria-label="Animation steps">
    ${steps
      .map(step => {
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
      })
      .join("")}
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
      getSceneHandle()?.post({ action: "setProgress", value: progress });
      getSceneHandle()?.post({ action: "pause" });
      updateAnimationStep(step);
    });
  });
}

function syncSliderAria(input, text) {
  if (input) input.setAttribute("aria-valuetext", text);
}

const ICON_PLAY = `<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.1-6.86a1 1 0 0 0 0-1.68L9.56 4.26A1 1 0 0 0 8 5.14z"/></svg>`;
const ICON_PAUSE = `<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 5h3.5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6.5 0H17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>`;
const ICON_RESET = `<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 5a7 7 0 1 1-6.32 4H8a1 1 0 1 1 0 2H4.5A1.5 1.5 0 0 1 3 9.5v-3a1 1 0 1 1 2 0v.86A9 9 0 1 0 12 3a1 1 0 1 1 0 2z"/></svg>`;

function syncPlayButton(playBtn = document.querySelector("#play-toggle")) {
  if (!playBtn) return;
  playBtn.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
  playBtn.setAttribute("aria-pressed", String(state.playing));
  playBtn.setAttribute("aria-label", state.playing ? "Pause animation" : "Play animation");
  playBtn.setAttribute("title", state.playing ? "Pause" : "Play");
}

function applyDualMethodUi(problem) {
  document.querySelectorAll("[data-method]").forEach(btn => {
    const selected = (btn.dataset.method === "washers") === state.alternate;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
  const track = document.querySelector(".step-track");
  if (track) {
    track.outerHTML = renderStepTrack(state.animationStep, problem);
    bindStepJumpControls();
  }
}

function goToQuestion(index) {
  const prepared = session.goToQuestion(index);
  render({ focusChoice: prepared.problem?.choices?.[0]?.id });
}

async function startPractice() {
  state.practiceLoading = true;
  state.practiceError = null;
  renderLanding();
  try {
    const prepared = await session.start(loadPracticeDependencies);
    render({ focusChoice: prepared.problem?.choices?.[0]?.id });
  } catch {
    practiceDependenciesPromise = null;
    renderLanding();
  }
}

function goLanding() {
  session.goHome();
  render();
}

function visualLabel(problem) {
  const prepared = state.prepared || problem?._prepared || session.currentPrepared();
  return prepared.visualLabel(state.alternate);
}

function solutionMethodLabel(_problem, alternate) {
  return session.solutionMethodLabel(alternate);
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
          <div class="solution-step-text">${formatSolutionBody(body)}</div>
        </div>
      </li>`;
    })
    .join("");
}

function renderModelControls(problem) {
  const dual = preparedHasDualMethod(state.prepared || problem?._prepared);
  const stripMax = maxStrips();
  const strips = Math.min(state.slices, stripMax);
  const progressPct = Math.round(state.playbackProgress * 100);
  const expanded = Boolean(state.modelControlsExpanded);
  const dualHtml = dual
    ? `
    <div class="segmented control-method-row" role="group" aria-label="Slice direction">
      <button type="button" class="${!state.alternate ? "selected" : ""}" data-method="shells" aria-pressed="${!state.alternate}" aria-label="Vertical strips">Vertical<span class="label-rest"> strips</span></button>
      <button type="button" class="${state.alternate ? "selected" : ""}" data-method="washers" aria-pressed="${state.alternate}" aria-label="Horizontal strips">Horizontal<span class="label-rest"> strips</span></button>
    </div>`
    : "";

  return `
    <div class="model-controls${expanded ? " is-expanded" : " is-collapsed"}">
      ${dualHtml}
      <div class="control-progress-row">
        <label class="control-field control-field-progress" for="playback-progress">
          <span class="control-label">Scrub</span>
          <input id="playback-progress" type="range" min="0" max="1" step="0.001" value="${state.playbackProgress}" aria-valuetext="${progressPct} percent" />
          <output id="progress-out" for="playback-progress">${progressPct}%</output>
        </label>
        <div class="control-transport" role="group" aria-label="Animation playback">
          <button type="button" id="play-toggle" class="primary control-btn control-btn-icon" aria-pressed="${state.playing}" aria-label="${state.playing ? "Pause animation" : "Play animation"}" title="${state.playing ? "Pause" : "Play"}">${state.playing ? ICON_PAUSE : ICON_PLAY}</button>
          <button type="button" id="reset-playback" class="secondary control-btn control-btn-icon" aria-label="Reset animation" title="Reset">${ICON_RESET}</button>
        </div>
        <button
          type="button"
          id="toggle-model-controls"
          class="control-expand-btn"
          aria-expanded="${expanded}"
          aria-controls="model-control-details"
          title="${expanded ? "Hide strips and speed" : "Show strips, speed, and camera reset"}"
        >
          <span class="control-expand-label">${expanded ? "Less" : "More"}</span>
          <span class="control-expand-chevron" aria-hidden="true"></span>
        </button>
      </div>
      <div class="control-details" id="model-control-details"${expanded ? "" : " hidden"}>
        <div class="control-grid">
          <label class="control-field" for="slices">
            <span class="control-label">Strips</span>
            <input id="slices" type="range" min="4" max="${stripMax}" step="1" value="${strips}" aria-valuetext="${strips} strips" />
            <output id="slices-out" for="slices">${strips}</output>
          </label>
          <label class="control-field" for="playback-speed">
            <span class="control-label">Speed</span>
            <input id="playback-speed" type="range" min="0.25" max="3" step="0.05" value="${state.playbackSpeed}" aria-valuetext="${state.playbackSpeed.toFixed(2)} times speed" />
            <output id="speed-out" for="playback-speed">${state.playbackSpeed.toFixed(2)}×</output>
          </label>
          <div class="control-actions">
            <button type="button" id="reset-view" class="text-button">Reset view</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSolution(p, correct) {
  const dual = preparedHasDualMethod(state.prepared || p?._prepared);
  const primarySteps = state.alternate && p.alternateSteps?.length ? p.alternateSteps : p.steps;
  const secondarySteps = state.alternate ? p.steps : p.alternateSteps;
  const secondaryLabel = solutionMethodLabel(p, !state.alternate);
  const method = session.animationMethod();
  const equationsHtml = renderEquationsBox(
    equationsForProblem(p, { alternate: state.alternate, topic: state.topic, method })
  );
  const stepsHtml = renderSolutionSteps(primarySteps);
  const resultLabel = correct ? "Correct" : "Not quite";
  const titleText = correct ? "Correct — worked solution" : "Not quite — worked solution";
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
        <p class="solution-result" role="status">${resultLabel}</p>
        <h2 id="solution-title">${titleText}</h2>
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
  if (!state.prepared || !state.problem) session.ensurePrepared();
  const p = state.problem;
  const correct = state.checked && state.selected === p.correctId;

  document.querySelector("#app").innerHTML = `
    <header class="topbar">
      <button type="button" class="brand brand-button" id="go-home" aria-label="Back to topics">
        <span class="brand-mark" aria-hidden="true">∫</span>
        <span>CEE 103</span>
      </button>
    </header>
    <div class="app-shell">
      <main class="workspace">
        <div class="content-grid">
          <section class="visual-panel" aria-label="${escape(visualLabel(p))}">
            <div class="visual-head compact">
              <div class="visual-head-row">
                ${renderStepTrack(state.animationStep, p)}
                <button
                  type="button"
                  id="camera-hint"
                  class="visual-camera-hint${state.cameraHelpOpen ? " is-open" : ""}"
                  title="${escape(cameraControlHint())}"
                  aria-label="${state.cameraHelpOpen ? "Hide camera controls help" : "Show camera controls help"}"
                  aria-expanded="${state.cameraHelpOpen}"
                  aria-controls="camera-help-panel"
                >?</button>
              </div>
              <p id="step-detail" class="step-detail" aria-live="polite">${escape(state.animationStepText)}</p>
              <div
                id="camera-help-panel"
                class="camera-help-panel"
                role="region"
                aria-label="Camera controls"
                ${state.cameraHelpOpen ? "" : "hidden"}
              >
                <p class="camera-help-text">${escape(cameraControlHint())}</p>
              </div>
            </div>
            <p id="viz-instructions" class="sr-only">${escape(vizStageInstructions())}</p>
            <div id="three-host" class="viz-host${state.vizLoading ? " is-loading" : ""}${state.vizError ? " has-error" : ""}" role="region" aria-label="Concept visualization" aria-busy="${state.vizLoading}" aria-describedby="viz-instructions">
              <div class="viz-loading" id="viz-loading" role="status" aria-live="polite" aria-hidden="${state.vizLoading && !state.vizError ? "false" : "true"}">
                <span class="viz-loading-bar" aria-hidden="true"></span>
                <span class="viz-loading-text">Loading visualization…</span>
              </div>
              <div class="viz-error" id="viz-error" role="alert" aria-hidden="${state.vizError ? "false" : "true"}"${state.vizError ? "" : " hidden"}>
                <p class="viz-error-text">${escape(state.vizError || "Couldn't load the visualization.")}</p>
                <button type="button" id="viz-retry" class="secondary control-btn">Try again</button>
              </div>
            </div>
            ${renderModelControls(p)}
          </section>
          <section class="problem-panel" aria-labelledby="question-title">
            <div class="question-top">
              <span class="question-number">${escape(p.title)}</span>
              <span class="question-index">Q${state.questionIndex + 1}</span>
            </div>
            <h1 id="question-title">${richMath(p.prompt)}</h1>
            ${sourceLinkHtml(p.source, escape)}
            <div class="choices" role="radiogroup" aria-labelledby="question-title">
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
          </section>
          ${state.showSolution ? renderSolution(p, correct) : ""}
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
      const visual = document.querySelector(".visual-panel");
      const panel = document.querySelector("#solution-panel");
      const target = isCompactViewport() ? visual : panel;
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
  const choiceButtons = [...document.querySelectorAll("[data-choice]")];
  choiceButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const id = button.dataset.choice;
      session.selectChoice(id);
      renderPractice({ preserveVisual: true, focusChoice: id });
    });
    button.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home" || event.key === "End") {
        const next = choiceButtons[event.key === "Home" ? 0 : choiceButtons.length - 1];
        const nextId = next.dataset.choice;
        session.selectChoice(nextId);
        renderPractice({ preserveVisual: true, focusChoice: nextId });
        return;
      }
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + choiceButtons.length) % choiceButtons.length;
      const nextId = choiceButtons[nextIndex].dataset.choice;
      session.selectChoice(nextId);
      renderPractice({ preserveVisual: true, focusChoice: nextId });
    });
  });
  if (!preserveVisual) {
    document.querySelectorAll("[data-method]").forEach(button => {
      button.addEventListener("click", () => {
        const nextAlternate = button.dataset.method === "washers";
        session.setAlternate(nextAlternate);
        const problem = state.problem;
        applyDualMethodUi(problem);
        applyDualMethodVisual(problem);
        if (!document.querySelector(".legacy-animation")) bindStepJumpControls();
      });
    });
    document.querySelector("#slices")?.addEventListener("input", event => {
      session.setSlices(event.target.value);
      const output = document.querySelector("#slices-out");
      if (output) output.textContent = state.slices;
      syncSliderAria(event.target, `${state.slices} strips`);
      getSceneHandle()?.post({ action: "setShells", value: state.slices });
    });
    document.querySelector("#playback-speed")?.addEventListener("input", event => {
      session.setSpeed(event.target.value);
      const output = document.querySelector("#speed-out");
      if (output) output.textContent = `${state.playbackSpeed.toFixed(2)}×`;
      syncSliderAria(event.target, `${state.playbackSpeed.toFixed(2)} times speed`);
      getSceneHandle()?.post({ action: "setSpeed", value: state.playbackSpeed });
    });
    document.querySelector("#playback-progress")?.addEventListener("input", event => {
      session.setProgress(event.target.value);
      const output = document.querySelector("#progress-out");
      if (output) output.textContent = `${Math.round(state.playbackProgress * 100)}%`;
      syncSliderAria(event.target, `${Math.round(state.playbackProgress * 100)} percent`);
      syncPlayButton();
      getSceneHandle()?.post({ action: "setProgress", value: state.playbackProgress });
    });
    document.querySelector("#play-toggle")?.addEventListener("click", () => {
      session.togglePlay();
      syncPlayButton();
      getSceneHandle()?.post({ action: state.playing ? "play" : "pause" });
    });
    document.querySelector("#reset-playback")?.addEventListener("click", () => {
      session.resetPlayback();
      const progressInput = document.querySelector("#playback-progress");
      const progressOut = document.querySelector("#progress-out");
      if (progressInput) progressInput.value = "0";
      if (progressOut) progressOut.textContent = "0%";
      syncPlayButton();
      getSceneHandle()?.post({ action: "resetPlayback" });
    });
    document.querySelector("#reset-view")?.addEventListener("click", () => getSceneHandle()?.reset());
    document.querySelector("#toggle-model-controls")?.addEventListener("click", event => {
      state.modelControlsExpanded = !state.modelControlsExpanded;
      const expanded = state.modelControlsExpanded;
      const root = event.currentTarget.closest(".model-controls");
      const details = document.querySelector("#model-control-details");
      const label = event.currentTarget.querySelector(".control-expand-label");
      if (root) {
        root.classList.toggle("is-expanded", expanded);
        root.classList.toggle("is-collapsed", !expanded);
      }
      if (details) details.hidden = !expanded;
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
      event.currentTarget.title = expanded
        ? "Hide strips and speed"
        : "Show strips, speed, and camera reset";
      if (label) label.textContent = expanded ? "Less" : "More";
    });
    document.querySelector("#camera-hint")?.addEventListener("click", event => {
      state.cameraHelpOpen = !state.cameraHelpOpen;
      const open = state.cameraHelpOpen;
      const panel = document.querySelector("#camera-help-panel");
      if (panel) panel.hidden = !open;
      event.currentTarget.classList.toggle("is-open", open);
      event.currentTarget.setAttribute("aria-expanded", String(open));
      event.currentTarget.setAttribute(
        "aria-label",
        open ? "Hide camera controls help" : "Show camera controls help"
      );
    });
    document.querySelector("#viz-retry")?.addEventListener("click", () => {
      if (state.problem) {
        state.vizError = null;
        mountScene(state.problem);
        bindStepJumpControls();
      }
    });
  }
  document.querySelector("#check")?.addEventListener("click", () => {
    session.check();
    renderPractice({ preserveVisual: true });
  });
  document.querySelector("#next")?.addEventListener("click", () => {
    session.next();
    render({ focusChoice: state.problem?.choices?.[0]?.id });
  });
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

initSceneHost({
  origin: SCENE_ORIGIN,
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
  syncPlayButton
});

function render(options) {
  if (state.screen === "landing") renderLanding();
  else renderPractice(options);
}

window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
  if (!event.matches) return;
  state.playing = false;
  syncPlayButton();
  getSceneHandle()?.post({ action: "pause" });
});

loadProgress(TOPICS);
render();
