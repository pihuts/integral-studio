/**
 * Practice session module — Landing / Practice transitions behind a small interface.
 *
 * Interface:
 *   createPracticeSession(deps) → {
 *     start, goHome, goToQuestion, selectChoice, check, next,
 *     setAlternate, setSlices, setSpeed, setProgress, togglePlay, resetPlayback,
 *     currentPrepared, viewFlags
 *   }
 *
 * Implementation owns question cache (PreparedProblem), progress persistence hooks.
 * View adapters (main.js) map commands → DOM; Scene host reads prepared + viz flags.
 */

import { QUESTIONS_PER_TOPIC } from "./bankMeta.js";
import { prepareProblem, preparedHasDualMethod } from "./preparedProblem.js";
import { state, problemKey, saveQuestionState, restoreQuestionState, saveProgress, shouldAutoplay } from "./practiceState.js";

/**
 * @param {object} deps
 * @param {(topic: string, index: number) => object|null} deps.loadProblemRow — finalize + bank/fallback, pre-materialize
 */
export function createPracticeSession(deps) {
  const { loadProblemRow } = deps;

  /** @type {Record<string, import('./preparedProblem.js').PreparedProblem>} */
  const preparedCache = {};

  function ensurePrepared() {
    const key = problemKey();
    if (!preparedCache[key]) {
      const row = loadProblemRow(state.topic, state.questionIndex);
      preparedCache[key] = prepareProblem(row);
    }
    const prepared = preparedCache[key];
    state.problem = prepared.problem;
    state.prepared = prepared;
    return prepared;
  }

  function currentPrepared() {
    return state.prepared || ensurePrepared();
  }

  function goToQuestion(index) {
    saveQuestionState();
    state.questionIndex = Math.max(0, Math.min(QUESTIONS_PER_TOPIC - 1, index));
    const prepared = ensurePrepared();
    restoreQuestionState(prepared.problem);
    state.playbackProgress = 0;
    state.playing = shouldAutoplay();
    state.alternate = false;
    state.method = "shells";
    state.vizError = null;
    return prepared;
  }

  async function start(loadDependencies) {
    state.practiceLoading = true;
    state.practiceError = null;
    try {
      if (loadDependencies) await loadDependencies();
    } catch {
      state.practiceLoading = false;
      state.practiceError = "Practice could not load. Check your connection and try again.";
      throw new Error("practice-load-failed");
    }
    state.practiceLoading = false;
    state.screen = "practice";
    state.questionIndex = 0;
    for (const k of Object.keys(preparedCache)) delete preparedCache[k];
    state.problemCache = {};
    Object.assign(state, { selected: null, checked: false, showSolution: false, alternate: false });
    const prepared = ensurePrepared();
    saveProgress();
    return prepared;
  }

  function goHome() {
    saveQuestionState();
    state.screen = "landing";
  }

  function selectChoice(id) {
    state.selected = id;
  }

  function check() {
    const problem = state.problem;
    if (!problem) return { correct: false };
    const isCorrect = state.selected === problem.correctId;
    state.checked = true;
    state.showSolution = true;
    problem.result = isCorrect;
    state.attempts += 1;
    if (isCorrect) state.correct += 1;
    saveQuestionState();
    saveProgress();
    return { correct: isCorrect };
  }

  function next() {
    return goToQuestion((state.questionIndex + 1) % QUESTIONS_PER_TOPIC);
  }

  function setAlternate(nextAlternate) {
    const prepared = currentPrepared();
    if (!preparedHasDualMethod(prepared)) return prepared;
    if (Boolean(nextAlternate) === state.alternate) return prepared;
    state.alternate = Boolean(nextAlternate);
    state.method = state.alternate ? "washers" : "shells";
    return prepared;
  }

  function setSlices(n) {
    state.slices = Number(n);
  }

  function setSpeed(n) {
    state.playbackSpeed = Number(n);
  }

  function setProgress(n) {
    state.playbackProgress = Number(n);
    state.playing = false;
  }

  function togglePlay() {
    state.playing = !state.playing;
    return state.playing;
  }

  function resetPlayback() {
    state.playbackProgress = 0;
    state.playing = false;
  }

  function solutionMethodLabel(alternate) {
    const prepared = currentPrepared();
    const spec = prepared.spec(alternate);
    const vertical = spec?.orientation === "vertical";
    const shells = spec?.method?.startsWith("shell");
    const slice = vertical ? "Vertical strips" : "Horizontal strips";
    const sweep = shells ? "shells" : "disks or washers";
    return `${slice} → ${sweep}`;
  }

  function animationMethod() {
    const prepared = currentPrepared();
    return (
      prepared.method(state.alternate) ||
      prepared.problem?.visual ||
      "area"
    );
  }

  return {
    start,
    goHome,
    goToQuestion,
    selectChoice,
    check,
    next,
    setAlternate,
    setSlices,
    setSpeed,
    setProgress,
    togglePlay,
    resetPlayback,
    ensurePrepared,
    currentPrepared,
    solutionMethodLabel,
    animationMethod,
    preparedCache
  };
}
