/** Audit GENERATED_BANK for NaN, broken choices, and bad latex. */
import { writeFileSync } from "fs";
import katex from "katex";

// Windows path fix
const { GENERATED_BANK } = await import("../src/generatedBank.js");

const BAD = [
  [/\\text\{NaN\}|\bNaN\b/, "NaN"],
  [/\\text\{Infinity\}|\bInfinity\b|\bzoo\b/, "Infinity/zoo"],
  [/\b2 1\b/, "broken pi-strip '2 1'"],
  [/\b1 1\b/, "broken pi-strip '1 1'"],
];

/** Match main.js: collapse accidental double-backslashes before KaTeX. */
const normalizeLatex = (value) => String(value).replace(/\\\\/g, "\\");

function bracesBalanced(s) {
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function katexRenders(latex) {
  try {
    const html = katex.renderToString(normalizeLatex(latex), {
      throwOnError: true,
      strict: "ignore",
      trust: false,
    });
    return !html.includes("katex-error");
  } catch {
    return false;
  }
}

const findings = [];
let total = 0;

for (const [topic, problems] of Object.entries(GENERATED_BANK)) {
  problems.forEach((p, idx) => {
    total++;
    const issues = [];
    const choices = p.choices || [];
    const steps = p.steps || [];
    const blob = [
      p.finalAnswer || "",
      ...choices.map((c) => c.latex || ""),
      ...steps.map((s) => `${s.title}\n${s.body}`),
    ].join("\n");

    for (const [re, label] of BAD) {
      if (re.test(blob)) issues.push(label);
    }

    if (choices.length !== 4) issues.push(`choices count=${choices.length}`);
    const correct = choices.filter((c) => c.label === "Correct");
    if (correct.length !== 1) issues.push(`Correct count=${correct.length}`);

    const lats = choices.map((c) => c.latex);
    if (new Set(lats).size < lats.length) issues.push("duplicate choice latex");

    // Correct choice should not be trivial garbage when answer is long
    if (correct[0] && /NaN/.test(correct[0].latex || "")) issues.push("correct is NaN");

    // Step final should not be NaN if finalAnswer is fine
    const finalStep = steps.find((s) => /final simplified/i.test(s.title || ""));
    if (finalStep && /NaN/.test(finalStep.body || "") && !/NaN/.test(p.finalAnswer || "")) {
      issues.push("step final NaN but finalAnswer ok");
    }

    for (const c of choices) {
      const lx = c.latex || "";
      if (!bracesBalanced(lx)) issues.push("unbalanced braces in choice");
      // Incomplete \frac{num} with no denominator — classic pi-strip debris
      if (/\\frac\s*\{[^{}]*\}\s*$/.test(lx) || /\\frac\s*\{[^{}]*\}(?!\s*\{)/.test(lx)) {
        // second pattern is noisy for nested fracs; rely on KaTeX below
      }
      if (!katexRenders(lx)) issues.push(`katex fail choice ${c.id}`);
    }

    if (issues.length) {
      findings.push({
        topic,
        idx,
        title: p.title,
        prompt: (p.prompt || "").slice(0, 120),
        issues: [...new Set(issues)],
      });
    }
  });
}

// Summarize
const by = {};
for (const f of findings) {
  for (const iss of f.issues) {
    (by[iss] ||= []).push(f);
  }
}

console.log(`audited ${total} problems`);
console.log(`with issues: ${findings.length}`);
for (const [iss, items] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${iss} (${items.length})`);
  for (const it of items.slice(0, 8)) {
    console.log(`  - [${it.topic}#${it.idx}] ${it.prompt}`);
  }
  if (items.length > 8) console.log(`  ... +${items.length - 8} more`);
}

writeFileSync(
  new URL("../agent-tools/bank-audit.json", import.meta.url),
  JSON.stringify(findings, null, 2)
);

// Spotlight the reported surface problem
const surf = GENERATED_BANK.surface || [];
const hit = surf.find((p) => /x\^\{3\/2\}/.test(p.prompt) && /\[0,1\]/.test(p.prompt));
if (hit) {
  console.log("\n=== spotlight y=(2/3)x^{3/2} on [0,1] ===");
  console.log("finalAnswer:", hit.finalAnswer);
  console.log("choices:", hit.choices.map((c) => c.latex));
  const lower = hit.steps.find((s) => /lower bound/i.test(s.title));
  const mult = hit.steps.find((s) => /constant factor/i.test(s.title));
  const fin = hit.steps.find((s) => /final simplified/i.test(s.title));
  console.log("lower:", lower?.body);
  console.log("mult:", mult?.body);
  console.log("fin:", fin?.body);
}

process.exit(findings.length ? 1 : 0);
