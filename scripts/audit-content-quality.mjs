/** Content-quality audit of GENERATED_BANK (beyond KaTeX parse). */
import { writeFileSync } from "fs";
import { GENERATED_BANK } from "../src/generatedBank.js";

const findings = [];

function add(topic, idx, p, issue, detail = "") {
  findings.push({
    topic,
    idx,
    source: p.source || "",
    prompt: (p.prompt || "").slice(0, 100),
    issue,
    detail: String(detail).slice(0, 200),
  });
}

function bracesBalanced(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === "{") d++;
    else if (ch === "}") {
      d--;
      if (d < 0) return false;
    }
  }
  return d === 0;
}

for (const [topic, problems] of Object.entries(GENERATED_BANK)) {
  problems.forEach((p, idx) => {
    const fa = p.finalAnswer || "";
    const choices = p.choices || [];
    const steps = p.steps || [];
    const blob = [fa, ...choices.map((c) => c.latex || ""), ...steps.map((s) => s.body || "")].join(
      "\n"
    );

    // Pedagogically bad double-angle rewrite of tan/cot/csc/sec antiderivatives
    if (/\\(?:tan|sin|cos)\{\\left\(2\s*[a-z]/.test(fa) || /\\(?:tan|sin|cos)\(2\s*[a-z]/.test(fa)) {
      if (/\\(?:sec|csc|tan|cot)/.test(p.prompt || "") || /sec|csc/.test(blob)) {
        add(topic, idx, p, "double-angle-trig-rewrite", fa);
      }
    }

    // asin/atan should be arcsin/arctan for calc textbooks
    if (/\\operatorname\{a(?:sin|cos|tan)\}/.test(blob)) {
      add(topic, idx, p, "operatorname-inverse-trig", fa.slice(0, 80));
    }

    // Nested frac in choices (ugly but valid): \frac{\frac{...}{...}}{2}
    for (const c of choices) {
      if (/\\frac\{\\frac/.test(c.latex || "")) {
        add(topic, idx, p, "nested-frac-choice", c.latex);
      }
    }

    // Step inconsistency: term-by-term shows tan/cot but combine uses double-angle
    const termStep = steps.find((s) => /term/i.test(s.title || ""));
    const combineStep = steps.find((s) => /combine|add the pieces|one antiderivative/i.test(s.title || ""));
    if (termStep && combineStep) {
      const t = termStep.body || "";
      const c = combineStep.body || "";
      if (/\\tan\{\\left\([a-z]/.test(t) || /\\tan\([a-z]/.test(t) || /cot|1\/\\tan/.test(t)) {
        if (/2\s*[a-z]/.test(c) && /tan|sin/.test(c)) {
          add(topic, idx, p, "step-inconsistent-combine", "terms ok, combine rewrote");
        }
      }
    }

    // Hyperbolics that slipped through
    if (/\\(?:sinh|cosh|tanh|coth|sech|csch)|\\operatorname\{a(?:sinh|cosh|tanh)\}/.test(blob)) {
      add(topic, idx, p, "hyperbolic-remaining", fa.slice(0, 80));
    }

    // NaN / zoo / Infinity
    if (/\bNaN\b|\\text\{NaN\}|\bzoo\b|\\infty/.test(fa)) {
      add(topic, idx, p, "bad-final-value", fa);
    }

    // Unbalanced braces in finalAnswer or steps (display math)
    for (const part of [fa, ...choices.map((c) => c.latex || "")]) {
      if (part && !bracesBalanced(part)) {
        add(topic, idx, p, "unbalanced-braces", part.slice(0, 80));
      }
    }

    // Choice half-wrap of whole labeled answer: "2(L = ...)" style leftover
    for (const c of choices) {
      if (/2\s*\(\s*[A-Za-z]\\s*=/.test(c.latex || "") || /2\([A-Za-z] =/.test(c.latex || "")) {
        add(topic, idx, p, "2x-wraps-label", c.latex);
      }
    }

    // Correct choice is trivial "0","1","2" while finalAnswer is long
    const correct = choices.find((c) => c.label === "Correct");
    if (correct && /^(0|1|2|\\pi|e-1)$/.test((correct.latex || "").trim()) && fa.length > 20) {
      add(topic, idx, p, "trivial-correct-choice", correct.latex);
    }

    // finalAnswer uses log while choices use ln inconsistently is OK;
    // flag asin{(x )} ugly form
    if (/\\operatorname\{a(?:sin|cos|tan)\}\{\(/.test(blob)) {
      add(topic, idx, p, "ugly-asin-brace-paren", fa.slice(0, 60));
    }

    // Incomplete fraction patterns that slipped
    if (/\\frac\{[^}]*\}(?!\s*\{)/.test(fa) && !/\\frac\{[^}]*\}\s*\{/.test(fa)) {
      // may false positive on \frac{a}{b}c — skip if has two groups somewhere
    }
  });
}

const by = {};
for (const f of findings) {
  (by[f.issue] ||= []).push(f);
}

console.log(`findings: ${findings.length}`);
for (const [iss, items] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${iss} (${items.length})`);
  for (const it of items.slice(0, 6)) {
    console.log(`  - [${it.topic}#${it.idx}] ${it.source.slice(0, 70)}`);
    if (it.detail) console.log(`      ${it.detail.slice(0, 100)}`);
  }
  if (items.length > 6) console.log(`  ... +${items.length - 6} more`);
}

writeFileSync(
  new URL("../agent-tools/content-quality-audit.json", import.meta.url),
  JSON.stringify({ findings, byIssue: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])) }, null, 2)
);
console.log("\nwrote agent-tools/content-quality-audit.json");
