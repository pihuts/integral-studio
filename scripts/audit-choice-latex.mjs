/**
 * Audit all MC choice latex strings with KaTeX (throwOnError: true).
 * Also flags broken patterns visible in the UI (raw \frac, empty frac, etc.).
 */
import fs from "fs";
import katex from "katex";
import { createRequire } from "module";

// Load bank as ESM-ish: strip export and eval, or parse choices with regex.
const text = fs.readFileSync("src/generatedBank.js", "utf8");

// Match problem blocks roughly via source + choices
const problemRe =
  /source:\s*("(?:\\.|[^"\\])*")[\s\S]*?prompt:\s*("(?:\\.|[^"\\])*")[\s\S]*?choices:\s*\[([\s\S]*?)\]/g;

const latexRe = /latex:\s*("(?:\\.|[^"\\])*")/g;
const labelRe = /label:\s*("(?:\\.|[^"\\])*")/g;

const normalizeLatex = (value) => String(value).replace(/\\\\/g, "\\");

const failures = [];
const warnings = [];
let totalChoices = 0;
let totalProblems = 0;

let m;
while ((m = problemRe.exec(text)) !== null) {
  totalProblems++;
  let source, prompt;
  try {
    source = JSON.parse(m[1]);
    prompt = JSON.parse(m[2]);
  } catch {
    source = m[1];
    prompt = m[2];
  }
  const choicesBlock = m[3];
  const latexes = [];
  let lm;
  latexRe.lastIndex = 0;
  while ((lm = latexRe.exec(choicesBlock)) !== null) {
    try {
      latexes.push(JSON.parse(lm[1]));
    } catch {
      latexes.push(lm[1]);
    }
  }

  latexes.forEach((latex, i) => {
    totalChoices++;
    const id = "abcd"[i] || String(i);
    const norm = normalizeLatex(latex);

    // Pattern smell tests (even if KaTeX is lenient)
    const smells = [];
    if (/\\frac\s*\{?\s*\}/.test(norm)) smells.push("empty-frac-num");
    if (/\\frac\{[^}]*\}\{\s*\}/.test(norm)) smells.push("empty-frac-den");
    if (/(?<![0-9])2\s+1(?![0-9])/.test(norm.replace(/\\/g, ""))) smells.push("orphan-2-1");
    if (/\\frac\s*\\pi\s*[^({]/.test(norm) && !/\\frac\{/.test(norm))
      smells.push("frac-without-braces");
    // unbalanced braces
    let depth = 0;
    for (const ch of norm) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth < 0) break;
    }
    if (depth !== 0) smells.push(`unbalanced-braces:${depth}`);

    let katexOk = true;
    let errMsg = "";
    try {
      katex.renderToString(norm, {
        throwOnError: true,
        strict: "ignore",
        trust: false,
      });
    } catch (e) {
      katexOk = false;
      errMsg = e.message;
    }

    // Also check throwOnError:false path for katex-error spans
    let hasErrorSpan = false;
    try {
      const html = katex.renderToString(norm, {
        throwOnError: false,
        strict: "ignore",
        trust: false,
      });
      hasErrorSpan = html.includes("katex-error");
    } catch {
      hasErrorSpan = true;
    }

    if (!katexOk || hasErrorSpan || smells.length) {
      failures.push({
        source,
        prompt: String(prompt).slice(0, 80),
        id,
        latex,
        norm,
        katexOk,
        hasErrorSpan,
        errMsg: errMsg.slice(0, 200),
        smells,
      });
    }
  });
}

console.log(`Problems scanned: ${totalProblems}`);
console.log(`Choices scanned:  ${totalChoices}`);
console.log(`Failures:         ${failures.length}`);
console.log("---");

// Group by error type
const byErr = new Map();
for (const f of failures) {
  const key = f.errMsg || f.smells.join(",") || (f.hasErrorSpan ? "error-span" : "unknown");
  if (!byErr.has(key)) byErr.set(key, []);
  byErr.get(key).push(f);
}

for (const [key, items] of [...byErr.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${items.length}x  ${key.slice(0, 120)}`);
  for (const f of items.slice(0, 8)) {
    console.log(`  [${f.id}] ${f.source}`);
    console.log(`       latex: ${f.latex.slice(0, 100)}`);
    if (f.smells.length) console.log(`       smells: ${f.smells.join(", ")}`);
  }
  if (items.length > 8) console.log(`  ... +${items.length - 8} more`);
}

// Write full report
fs.writeFileSync(
  "agent-tools/choice-latex-audit.json",
  JSON.stringify({ totalProblems, totalChoices, failures }, null, 2)
);
console.log("\nWrote agent-tools/choice-latex-audit.json");
