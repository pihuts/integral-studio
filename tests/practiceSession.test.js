/**
 * Practice session transitions (no DOM).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPracticeSession } from "../src/practiceSession.js";
import { state } from "../src/practiceState.js";

function stubRow(topic, index) {
  return {
    title: `${topic}#${index}`,
    prompt: "Find \\(1\\).",
    visual: "area",
    given: { a: 1, b: 2, n: 1 },
    choices: [
      { id: "a", latex: "1", label: "Correct" },
      { id: "b", latex: "2", label: "Wrong" }
    ],
    correctId: "a",
    steps: [{ title: "Step", body: "Done." }]
  };
}

describe("practiceSession", () => {
  beforeEach(() => {
    Object.assign(state, {
      screen: "landing",
      topic: "area",
      questionIndex: 0,
      selected: null,
      checked: false,
      showSolution: false,
      correct: 0,
      attempts: 0,
      alternate: false,
      problem: null,
      prepared: null,
      problemCache: {}
    });
  });

  it("start prepares problem and enters practice", async () => {
    const session = createPracticeSession({
      loadProblemRow: (topic, i) => stubRow(topic, i)
    });
    const prepared = await session.start(async () => {});
    assert.equal(state.screen, "practice");
    assert.ok(prepared.spec());
    assert.equal(state.problem.title, "area#0");
  });

  it("check grades selection", async () => {
    const session = createPracticeSession({
      loadProblemRow: (topic, i) => stubRow(topic, i)
    });
    await session.start(async () => {});
    session.selectChoice("a");
    const result = session.check();
    assert.equal(result.correct, true);
    assert.equal(state.checked, true);
    assert.equal(state.correct, 1);
  });

  it("goToQuestion advances index", async () => {
    const session = createPracticeSession({
      loadProblemRow: (topic, i) => stubRow(topic, i)
    });
    await session.start(async () => {});
    session.goToQuestion(3);
    assert.equal(state.questionIndex, 3);
    assert.equal(state.problem.title, "area#3");
  });
});
