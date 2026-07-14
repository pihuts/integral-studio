/**
 * Practice session state — Landing / Practice screen model.
 * UI modules read/write this object; no DOM here.
 */

export const state = {
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
  playbackSpeed: 3,
  playbackProgress: 0,
  playing: false,
  /** Extra viz controls (strips / speed / reset view); primary transport stays visible when false. */
  modelControlsExpanded: false,
  /** Camera help callout under the step row (touch-friendly; not title-only). */
  cameraHelpOpen: false,
  alternate: false,
  problem: null,
  /** @type {import('./preparedProblem.js').PreparedProblem|null} session-local materialization */
  prepared: null,
  problemCache: {},
  animationStep: "region",
  animationStepText: "Sketch the bounded region.",
  vizLoading: true,
  vizError: null,
  practiceLoading: false,
  practiceError: null
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isCoarsePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export const isNarrowViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 600px)").matches;

export const isCompactViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;

export const scrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

/**
 * Whether the scene should start playing on mount / question change.
 * Off for reduced motion, touch, and narrow phones (battery + WCAG pause discoverability).
 */
export function shouldAutoplay() {
  if (prefersReducedMotion()) return false;
  if (isCoarsePointer() || isNarrowViewport()) return false;
  return true;
}

export function maxStrips() {
  return isCoarsePointer() || isNarrowViewport() ? 24 : 48;
}

export function cameraControlHint() {
  if (isCoarsePointer()) {
    return "Drag diagram to orbit · pinch zoom · two-finger pan · focus diagram for arrows/±/R";
  }
  return "Drag diagram to orbit · scroll zoom · right-drag pan · focus diagram for arrows/±/R";
}

/** Static instructions for the stage (aria-describedby target — not a control). */
export function vizStageInstructions() {
  return `${cameraControlHint()}. Use Scrub and Play under the diagram to control the animation.`;
}

export function saveProgress() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      "integral-studio-progress",
      JSON.stringify({
        topic: state.topic,
        correct: state.correct,
        attempts: state.attempts
      })
    );
  } catch {
    /* optional */
  }
}

export function loadProgress(topics) {
  if (typeof localStorage === "undefined") return;
  try {
    const saved = JSON.parse(localStorage.getItem("integral-studio-progress") || "{}");
    if (saved.topic && topics[saved.topic]) state.topic = saved.topic;
    if (typeof saved.correct === "number") state.correct = saved.correct;
    if (typeof saved.attempts === "number") state.attempts = saved.attempts;
  } catch {
    /* optional */
  }
}

export function problemKey() {
  return `${state.topic}:${state.questionIndex}`;
}

export function saveQuestionState() {
  if (state.problem) {
    state.problem.ui = {
      selected: state.selected,
      checked: state.checked,
      showSolution: state.showSolution
    };
  }
}

export function restoreQuestionState(problem) {
  Object.assign(state, problem.ui || { selected: null, checked: false, showSolution: false });
}

// Default: autoplay only when motion is welcome and pause is easy to keep on-screen
if (typeof window !== "undefined") {
  state.playing = shouldAutoplay();
}
