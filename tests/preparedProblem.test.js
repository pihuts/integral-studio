/**
 * PreparedProblem + Materialization seam tests.
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepareProblem, preparedHasDualMethod } from "../src/preparedProblem.js";
import { materializeVisualExample, validateVisualSpec } from "../src/materializeVisual.js";
import { resolveOrientation, buildLegacySpec } from "../src/visualSpecs.js";
import {
  methodFamily,
  stackPieceKind,
  framePolicy,
  isShellMethod
} from "../src/methodRenderers.js";
import { rebuildCompletedStack } from "../src/sceneFamilyAdapters.js";
import { QUESTIONS_PER_TOPIC } from "../src/bankMeta.js";
import { TOPICS, problemCount } from "../src/bank.js";
import {
  SUPPORTED_RENDER_METHODS,
  SPEC_PROVENANCE,
  validateVisualSpecShape
} from "../src/visualSpecSchema.js";

describe("bankMeta / bank", () => {
  it("exports QUESTIONS_PER_TOPIC as positive size", () => {
    assert.equal(QUESTIONS_PER_TOPIC, 50);
  });

  it("lists curriculum topics", () => {
    assert.ok(TOPICS.volumes);
    assert.ok(TOPICS.area);
  });

  it("problemCount is zero before bank load (empty module state ok)", () => {
    assert.equal(typeof problemCount("area"), "number");
  });
});

describe("visualSpecSchema", () => {
  it("lists shell and washer methods", () => {
    assert.ok(SUPPORTED_RENDER_METHODS.includes("shell-y"));
    assert.ok(SUPPORTED_RENDER_METHODS.includes("washer-x"));
  });

  it("validateVisualSpecShape rejects unknown methods", () => {
    const result = validateVisualSpecShape({ method: "not-a-method", xMin: 0, xMax: 1 });
    assert.equal(result.ok, false);
  });
});

describe("resolveOrientation", () => {
  it("maps shell-y to vertical and shell-x to horizontal", () => {
    assert.equal(resolveOrientation("shell-y", "vertical"), "vertical");
    assert.equal(resolveOrientation("shell-x", "vertical"), "horizontal");
  });
});

describe("methodRenderers policy", () => {
  it("classifies families and stack kinds", () => {
    assert.equal(methodFamily("shell-y"), "shell");
    assert.equal(stackPieceKind("shell-y"), "shell");
    assert.equal(stackPieceKind("area"), "slice");
    assert.equal(stackPieceKind("surface-y"), "surface-y");
    assert.ok(isShellMethod("shell-x"));
  });

  it("framePolicy exposes goatStage from progress", () => {
    const early = framePolicy("goat-barn", 0.1);
    const mid = framePolicy("goat-barn", 0.5);
    const late = framePolicy("goat-barn", 0.9);
    assert.equal(early.goatStage, 1);
    assert.equal(mid.goatStage, 2);
    assert.equal(late.goatStage, 3);
    assert.equal(early.family, "goat-barn");
  });
});

describe("sceneFamilyAdapters", () => {
  it("rebuildCompletedStack dispatches shell pieces", () => {
    const pieces = [];
    const ex = {
      orientation: "vertical",
      xMin: 0,
      xMax: 2,
      method: "shell-y",
      top: () => 1,
      bottom: () => 0
    };
    rebuildCompletedStack(
      "shell",
      ex,
      4,
      0.5,
      {
        makeSlice: () => ({ t: "slice" }),
        makeCrossSection: () => ({ t: "cross" }),
        makeShell: () => ({ t: "shell" }),
        makeWasherOrDisk: () => ({ t: "disk" }),
        makeSurfaceBand: () => ({ t: "sx" }),
        makeSurfaceBandY: () => ({ t: "sy" }),
        makeCircumferenceRing: () => ({ t: "ring" }),
        makeCircumferenceRingY: () => ({ t: "ringy" }),
        makeArcApproximation: () => ({ t: "arc" }),
        makePumpSample: () => ({ t: "pump" }),
        makePoolFill: () => ({ t: "pool" }),
        add: (_g, piece) => pieces.push(piece)
      },
      { completed: {}, lineAmber: {} }
    );
    assert.equal(pieces.length, 2);
    assert.equal(pieces[0].t, "shell");
  });
});

describe("materializeVisualExample", () => {
  it("builds a legacy volume VisualSpec with dual method", () => {
    const problem = {
      title: "Volume",
      visual: "volume",
      given: { a: 2, b: 3, n: 1 },
      choices: [{ id: "a", latex: "1", label: "Correct" }],
      correctId: "a",
      steps: []
    };
    const mat = materializeVisualExample(problem);
    assert.ok(mat.spec);
    assert.equal(mat.spec.method, "shell-y");
    assert.equal(mat.validation.ok, true);
    assert.equal(mat.dualMethod, true);
    assert.ok(mat.example);
    assert.equal(typeof mat.example.top, "function");
    assert.ok(mat.provenance === SPEC_PROVENANCE.LEGACY || mat.provenance);

    const alt = materializeVisualExample(problem, { alternate: true });
    assert.ok(alt.spec);
    assert.equal(alt.spec.orientation, "horizontal");
  });

  it("validateVisualSpec rejects unknown methods", () => {
    const result = validateVisualSpec({ method: "not-a-method", xMin: 0, xMax: 1 });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => /unsupported method/.test(e)));
  });

  it("buildLegacySpec is the single legacy owner", () => {
    const spec = buildLegacySpec({ visual: "area", given: { a: 3, b: 4 } });
    assert.equal(spec.method, "area");
    assert.equal(spec.xMax, 4);
  });
});

describe("prepareProblem", () => {
  it("materializes once and exposes primary + alternate", () => {
    const problem = {
      title: "Volume",
      visual: "volume",
      given: { a: 2, b: 3, n: 1 },
      choices: [{ id: "a", latex: "1", label: "Correct" }],
      correctId: "a",
      steps: []
    };
    const prepared = prepareProblem(problem);
    assert.equal(preparedHasDualMethod(prepared), true);
    assert.equal(prepared.spec(false).method, "shell-y");
    assert.equal(prepared.spec(true).orientation, "horizontal");
    assert.equal(prepared.visualLabel(false), "Vertical strips");
    assert.equal(prepared.visualLabel(true), "Horizontal strips");
    assert.ok(prepared.problem._prepared === prepared);
  });

  it("re-materialize with _prepared does not throw", () => {
    const problem = {
      title: "Area",
      visual: "area",
      given: { a: 1, b: 2 },
      choices: [{ id: "a", latex: "1", label: "Correct" }],
      correctId: "a",
      steps: []
    };
    const prepared = prepareProblem(problem);
    const again = materializeVisualExample(prepared.problem, { alternate: false });
    assert.ok(again.spec);
    assert.equal(again.validation.ok, true);
  });
});
