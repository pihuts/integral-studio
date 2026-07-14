import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSolutionBody } from "../src/mathRender.js";

test("formatSolutionBody turns qty bullets into a structured list", () => {
  const body = [
    "Write each quantity from the problem before building the integral:",
    "- \\(R=x^{2}\\): disk radius — distance from the axis of rotation to the curve",
    "- \\(\\pi=\\pi\\): from circular cross-section area \\(A=\\pi R^{2}\\)",
    "- \\(dx=dx\\): disk thickness",
    "- \\(x=0\\to1\\): limits — where the solid starts and ends"
  ].join("\n");

  const html = formatSolutionBody(body);
  assert.match(html, /solution-step-lead/);
  assert.match(html, /solution-qty-list/);
  assert.equal((html.match(/solution-qty-item/g) || []).length, 4);
  assert.match(html, /solution-qty-symbol/);
  assert.match(html, /disk radius/);
  assert.match(html, /disk thickness/);
});

test("formatSolutionBody keeps plain paragraphs", () => {
  const html = formatSolutionBody("Just a single explanatory sentence.");
  assert.match(html, /solution-step-lead/);
  assert.doesNotMatch(html, /solution-qty-list/);
});
