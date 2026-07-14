/**
 * Deep animation QC: semantic prompt↔method, geometry sanity, coverage.
 * Run: node scripts/audit-animations-deep.mjs
 * Exit 1 if any error-severity issues.
 */

import { getBriggsProblem, briggsProblemCount, loadBriggsBank } from "../src/briggsProblems.js";
import { VISUAL_BY_SOURCE, VISUAL_BY_KEY } from "../src/briggsVisualSpecs.js";
import { buildExampleFromSpec, compileCurve, SUPPORTED_RENDER_METHODS } from "../src/visualSpecs.js";
import { materializeVisualExample } from "../src/materializeVisual.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPICS = [
  "fundamentals",
  "area",
  "volumes",
  "centroids",
  "arc",
  "surface",
  "inertia",
  "applications"
];

await loadBriggsBank();
const RENDERER_METHODS = new Set(SUPPORTED_RENDER_METHODS);

const SHELL_PREFIX = "shell";
const DISK_WASHER = new Set(["disk-x", "disk-y", "washer-x", "washer-y"]);

function isHandled(method) {
  if (!method) return false;
  if (RENDERER_METHODS.has(method)) return true;
  if (method.startsWith(SHELL_PREFIX)) return true;
  if (DISK_WASHER.has(method)) return true;
  return false;
}

/** Infer acceptable methods from problem text. Empty = no strong constraint. */
function expectedMethods(prompt, visual, topic) {
  const p = String(prompt || "");
  const out = new Set();

  if (/semicircles with diameter/i.test(p)) out.add("cross-semicircle");
  if (/squares with side/i.test(p) && /cross sections/i.test(p)) out.add("cross-square");

  if (/Use shells/i.test(p)) {
    if (/about the \(?y\)?-axis/i.test(p) || /about the vertical/i.test(p) || /about(?: the (?:vertical )?line)? \(?x\s*=/i.test(p)) {
      out.add("shell-y");
    } else if (/about the \(?x\)?-axis/i.test(p) || /about the horizontal/i.test(p) || /about(?: the (?:horizontal )?line)? \(?y\s*=/i.test(p)) {
      out.add("shell-x");
    } else {
      out.add("shell-y");
      out.add("shell-x");
    }
  }

  if (/Use (?:disks|washers)/i.test(p)) {
    if (/about the \(?y\)?-axis/i.test(p) || /about the vertical/i.test(p)) {
      out.add("disk-y");
      out.add("washer-y");
    } else {
      out.add("disk-x");
      out.add("washer-x");
    }
  }

  // Generic rotation (volume)
  if (
    topic === "volumes" &&
    /(?:Rotate|revolved|revolve)/i.test(p) &&
    !/Use shells/i.test(p) &&
    !/Use (?:disks|washers)/i.test(p) &&
    !/cross sections/i.test(p)
  ) {
    if (/about the \(?y\)?-axis/i.test(p) || /about the vertical line/i.test(p) || /about \(?x\s*=/i.test(p)) {
      out.add("shell-y");
      out.add("disk-y");
      out.add("washer-y");
    } else if (/about the \(?x\)?-axis/i.test(p) || /about the horizontal line/i.test(p) || /about \(?y\s*=/i.test(p)) {
      out.add("shell-x");
      out.add("disk-x");
      out.add("washer-x");
    } else {
      ["shell-y", "shell-x", "disk-x", "disk-y", "washer-x", "washer-y"].forEach((m) => out.add(m));
    }
  }

  if (topic === "surface" || visual === "surface") {
    const aboutYAxis = /about\s+(?:the\s+)?\\?\(?y\\?\)?-axis/i.test(p) || /about\s+\\?\(?x\s*=/i.test(p);
    const aboutXAxis = /about\s+(?:the\s+)?\\?\(?x\\?\)?-axis/i.test(p) || /about\s+\\?\(?y\s*=/i.test(p);
    const xOfY = /\\?\(?x\s*=/.test(p) && /y\s*\\in|y\s+in/i.test(p);
    if (aboutYAxis || (aboutXAxis && xOfY)) out.add("surface-y");
    else if (aboutXAxis) out.add("surface-x");
    else out.add("surface-x");
  }

  if (topic === "arc" || visual === "curve") out.add("arc");

  // Specialized 3D demos (not every "pump/tank work" word problem).
  if (/hemispherical bowl/i.test(p) && /pump|spout|lift/i.test(p)) out.add("pump-bowl");
  if (/swimming pool/i.test(p) && /fill|depth/i.test(p)) out.add("pool-fill");
  if (/\bgoat\b/i.test(p) && /barn|leash/i.test(p)) out.add("goat-barn");

  return [...out];
}

function sampleRange(fn, min, max, steps = 64) {
  let lo = Infinity;
  let hi = -Infinity;
  let nan = 0;
  let finite = 0;
  let maxAbs = 0;
  for (let i = 0; i <= steps; i += 1) {
    const t = min + ((max - min) * i) / steps;
    const v = fn(t);
    if (Number.isFinite(v)) {
      finite += 1;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      maxAbs = Math.max(maxAbs, Math.abs(v));
    } else nan += 1;
  }
  return { lo, hi, nan, finite, maxAbs, allNaN: finite === 0 };
}

function auditPromptCurveMatch(problem, spec, built, issues) {
  if (!built?.top) return;
  const prompt = String(problem.prompt || "");

  let m = prompt.match(/y=([0-9.]+)\+\\sin x/);
  if (m) {
    const c = Number(m[1]);
    const y = built.top(Math.PI / 2);
    if (Math.abs(y - (c + 1)) > 0.15) {
      issues.push({
        severity: "error",
        code: "sin-offset-missing",
        message: `prompt y=${c}+sin x but top(π/2)=${y} (expected ~${c + 1})`
      });
    }
  }

  m = prompt.match(/y=([0-9.]+)\+e\^\{-x\}/);
  if (m) {
    const c = Number(m[1]);
    const y = built.top(0);
    if (Math.abs(y - (c + 1)) > 0.15) {
      issues.push({
        severity: "error",
        code: "exp-offset-missing",
        message: `prompt y=${c}+e^{-x} but top(0)=${y} (expected ~${c + 1})`
      });
    }
  }

  m = prompt.match(/diameter \\\(([0-9.]+)x\\\) on \\\(\[0,([0-9.]+)\]\\\)/);
  if (m) {
    if (spec.method !== "cross-semicircle") {
      issues.push({
        severity: "error",
        code: "semi-method",
        message: `semicircle prompt but method=${spec.method}`
      });
    }
    const a = Number(m[1]);
    const h = built.top(1) - built.bottom(1);
    if (Math.abs(h - a) > 0.05) {
      issues.push({
        severity: "error",
        code: "semi-diameter",
        message: `diameter should be ${a}x; height at x=1 is ${h}`
      });
    }
  }

  m = prompt.match(/squares with side \\\(([0-9.]+)x\\\)/);
  if (m && /cross sections/i.test(prompt)) {
    if (spec.method !== "cross-square") {
      issues.push({
        severity: "error",
        code: "square-method",
        message: `square cross-section prompt but method=${spec.method}`
      });
    }
  }
}

function auditGeometrySanity(spec, built, issues) {
  const method = built.method || "area";
  if (built.orientation === "vertical") {
    const top = sampleRange(built.top, built.xMin, built.xMax);
    const bottom = sampleRange(built.bottom, built.xMin, built.xMax);
    if (top.maxAbs > 200 || bottom.maxAbs > 200) {
      issues.push({
        severity: "warn",
        code: "extreme-values",
        message: `curve values very large (top maxAbs=${top.maxAbs.toFixed(1)}, bottom maxAbs=${bottom.maxAbs.toFixed(1)}) — camera may clip`
      });
    }
    // Region height sign: surface-x may store curve as "top" below axisY (OK; verticalBounds min/max).
    // Signed integrands (velocity, mixed trig) intentionally cross the axis — warn only.
    if (!top.allNaN && !bottom.allNaN && method !== "surface-x" && method !== "surface-y") {
      let inv = 0;
      let pos = 0;
      for (let i = 0; i <= 20; i += 1) {
        const x = built.xMin + ((built.xMax - built.xMin) * i) / 20;
        const h = built.top(x) - built.bottom(x);
        if (h < -1e-6) inv += 1;
        if (h > 1e-6) pos += 1;
      }
      if (inv > 10 && pos === 0) {
        issues.push({
          severity: "error",
          code: "inverted-region",
          message: `region height is non-positive on all samples (${inv}/21) — domain past a root or swapped bounds`
        });
      } else if (inv > 10 && pos > 0) {
        issues.push({
          severity: "warn",
          code: "signed-integrand",
          message: `integrand changes sign (${inv} negative / ${pos} positive samples) — OK for signed area, region mesh straddles axis`
        });
      }
    }
    // Cross-section diameter/side should match region height
    if (method === "cross-semicircle" || method === "cross-square") {
      const mid = (built.xMin + built.xMax) / 2;
      const h = built.top(mid) - built.bottom(mid);
      if (!(h > 0)) {
        issues.push({
          severity: "error",
          code: "cross-empty-height",
          message: `cross-section region height at mid x is ${h}`
        });
      }
    }
    // Disk/washer about x: region should have positive height (radius)
    if (method === "disk-x" || method === "washer-x") {
      let pos = 0;
      for (let i = 0; i <= 20; i += 1) {
        const x = built.xMin + ((built.xMax - built.xMin) * i) / 20;
        if (built.top(x) - built.bottom(x) > 1e-9) pos += 1;
      }
      if (pos < 3) {
        issues.push({
          severity: "error",
          code: "disk-empty-region",
          message: "disk/washer-x region has near-zero height almost everywhere"
        });
      }
    }
  } else if (built.orientation === "horizontal") {
    const left = sampleRange(built.left, built.yMin, built.yMax);
    const right = sampleRange(built.right, built.yMin, built.yMax);
    if (left.maxAbs > 200 || right.maxAbs > 200) {
      issues.push({
        severity: "warn",
        code: "extreme-values",
        message: `horizontal curve values very large (left maxAbs=${left.maxAbs.toFixed(1)})`
      });
    }
  }

  // Surface of revolution needs a curve not on the axis entirely
  if (method === "surface-x" && built.orientation === "vertical") {
    const axisY = spec.axisY ?? 0;
    let off = 0;
    for (let i = 0; i <= 20; i += 1) {
      const x = built.xMin + ((built.xMax - built.xMin) * i) / 20;
      if (Math.abs(built.top(x) - axisY) > 1e-6) off += 1;
    }
    if (off < 3) {
      issues.push({
        severity: "error",
        code: "surface-zero-radius",
        message: "surface-x curve lies on the axis of revolution (radius ~ 0)"
      });
    }
  }
}

function auditSemantic(problem, spec, issues) {
  const method = spec?.method || "area";
  const topic = problem._topic;
  const expected = expectedMethods(problem.prompt, problem.visual, topic);

  if (!isHandled(method)) {
    issues.push({
      severity: "error",
      code: "unhandled-method",
      message: `method "${method}" has no render path in original-shell.js`
    });
  }

  if (expected.length && !expected.includes(method)) {
    // Soften: fundamentals/area/centroids often intentionally use area viz
    if (["fundamentals", "area", "centroids", "inertia"].includes(topic) && method === "area") {
      // ok
    } else if (topic === "applications" && method === "area" && expected.includes("pump-bowl")) {
      // Generic area visuals remain valid for older application entries.
    } else {
      issues.push({
        severity: "error",
        code: "method-prompt-mismatch",
        message: `method="${method}" but prompt suggests ${expected.join("|")}`,
        prompt: String(problem.prompt || "").slice(0, 140)
      });
    }
  }

  // Volume topic should rarely be pure area unless cross-section repair failed
  if (topic === "volumes" && method === "area" && !/cross sections/i.test(problem.prompt || "")) {
    issues.push({
      severity: "error",
      code: "volume-as-area",
      message: "volumes problem still using method=area (not disk/washer/shell/cross)",
      prompt: String(problem.prompt || "").slice(0, 140)
    });
  }

  // visual field vs method family
  if (problem.visual === "volume" && method === "area") {
    issues.push({
      severity: "warn",
      code: "visual-volume-method-area",
      message: "problem.visual=volume but animation method=area"
    });
  }
  if (problem.visual === "curve" && method !== "arc") {
    issues.push({
      severity: "error",
      code: "curve-not-arc",
      message: `visual=curve but method=${method}`
    });
  }
  if (problem.visual === "surface" && !String(method).startsWith("surface")) {
    issues.push({
      severity: "error",
      code: "surface-not-surface",
      message: `visual=surface but method=${method}`
    });
  }
}

function auditSpecTechnical(spec, issues) {
  if (!spec) {
    issues.push({ severity: "error", code: "no-spec", message: "missing visualSpec" });
    return null;
  }
  const built = buildExampleFromSpec(spec);
  if (!built) {
    issues.push({ severity: "error", code: "build-failed", message: "buildExampleFromSpec null" });
    return null;
  }
  if (built.orientation === "vertical") {
    if (typeof built.top !== "function" || typeof built.bottom !== "function") {
      issues.push({ severity: "error", code: "missing-bounds", message: "vertical missing top/bottom fn" });
    }
    if (!(built.xMax > built.xMin)) {
      issues.push({ severity: "error", code: "bad-interval", message: `xMin=${built.xMin} xMax=${built.xMax}` });
    }
  } else if (built.orientation === "horizontal") {
    if (typeof built.left !== "function" || typeof built.right !== "function") {
      issues.push({ severity: "error", code: "missing-bounds", message: "horizontal missing left/right fn" });
    }
    if (!(built.yMax > built.yMin)) {
      issues.push({ severity: "error", code: "bad-interval", message: `yMin=${built.yMin} yMax=${built.yMax}` });
    }
  }
  return built;
}

/** Static checks against original-shell.js source for known geometry pitfalls. */
function auditRendererSource(issues) {
  const shellPath = path.join(__dirname, "../src/original-shell.js");
  const src = fs.readFileSync(shellPath, "utf8");

  // Semicircle must use diameter along Y / bulge +Z (thetaStart = -PI/2)
  const semiFn = src.match(/function makeCrossSection[\s\S]*?function bowlRadius/);
  const semiBlock = semiFn?.[0]?.match(/if \(ex\.method === "cross-semicircle"\) \{[\s\S]*?return mesh;\s*\}/);
  if (!semiBlock) {
    issues.push({
      severity: "error",
      code: "renderer-missing-semicircle",
      message: "makeCrossSection missing cross-semicircle branch"
    });
  } else {
    const block = semiBlock[0];
    if (!block.includes("-Math.PI / 2") && !block.includes("-Math.PI/2")) {
      issues.push({
        severity: "error",
        code: "semicircle-bad-theta",
        message: "cross-semicircle CylinderGeometry should use thetaStart=-π/2 so diameter lies on the base"
      });
    }
    if (/translate\(\s*xToWorld\(value\),\s*yToWorld\(bounds\.lower\)\s*,\s*0\s*\)/.test(block)) {
      issues.push({
        severity: "error",
        code: "semicircle-bad-center",
        message: "cross-semicircle still centers at bounds.lower (should be diameter midpoint)"
      });
    }
    if (!/bounds\.lower \+ diameter \/ 2|bounds\.lower \+ side \/ 2/.test(block) && !block.includes("diameter / 2")) {
      issues.push({
        severity: "warn",
        code: "semicircle-center-check",
        message: "cross-semicircle should place mesh at diameter midpoint along y"
      });
    }
  }

  // surface-y must not only fall through to washer in completed rebuild — check both branches exist
  if (!src.includes('ex.method === "surface-y"') && !src.includes("ex.method === 'surface-y'")) {
    issues.push({
      severity: "error",
      code: "renderer-missing-surface-y",
      message: "no surface-y handling in original-shell.js"
    });
  }

  // ensure makeSurfaceBandY exists
  if (!src.includes("function makeSurfaceBandY")) {
    issues.push({
      severity: "error",
      code: "renderer-missing-makeSurfaceBandY",
      message: "makeSurfaceBandY not defined"
    });
  }

  // cross- methods use makeCrossSection
  if (!src.includes("function makeCrossSection")) {
    issues.push({
      severity: "error",
      code: "renderer-missing-cross",
      message: "makeCrossSection not defined"
    });
  }

  // Shell path present
  if (!src.includes("function makeShell") || !src.includes("function makeWasherOrDisk")) {
    issues.push({
      severity: "error",
      code: "renderer-missing-solid",
      message: "makeShell or makeWasherOrDisk missing"
    });
  }
}

function main() {
  const results = [];
  const methodHist = new Map();
  const rendererIssues = [];
  auditRendererSource(rendererIssues);

  for (const topic of TOPICS) {
    const n = briggsProblemCount(topic);
    for (let i = 0; i < n; i += 1) {
      const problem = getBriggsProblem(topic, "medium", i);
      if (!problem) continue;
      problem._topic = topic;
      const issues = [];
      // Single Materialization seam — attach / repair / validate (same as Practice).
      const mat = materializeVisualExample(problem, { alternate: false });
      const spec = mat.spec;
      const built = auditSpecTechnical(spec, issues);
      if (spec) {
        methodHist.set(spec.method || "area", (methodHist.get(spec.method || "area") || 0) + 1);
        auditSemantic(mat.problem || problem, spec, issues);
        if (built) {
          auditGeometrySanity(spec, built, issues);
          auditPromptCurveMatch(mat.problem || problem, spec, built, issues);
        }
        if (mat.provenance === "repair") {
          issues.push({
            severity: "info",
            code: "repair-provenance",
            message: "VisualSpec required runtime repair (generator visualParams incomplete)"
          });
        }
      } else {
        issues.push({ severity: "error", code: "no-spec", message: "materializeVisualExample returned null spec" });
      }

      // alternate via same Materialization seam
      if (mat.dualMethod || mat.problem?.visualSpec?.alternateSpec) {
        const altMat = materializeVisualExample(mat.problem || problem, { alternate: true });
        const alt = altMat.spec;
        if (alt && alt !== spec) {
          const altIssues = [];
          const altBuilt = auditSpecTechnical(alt, altIssues);
          if (altBuilt) auditGeometrySanity(alt, altBuilt, altIssues);
          for (const iss of altIssues) {
            issues.push({ ...iss, message: `[alternate] ${iss.message}` });
          }
        }
      }

      if (issues.length) {
        results.push({
          id: `${topic}#${i}`,
          source: problem.source,
          title: problem.title,
          method: spec?.method,
          prompt: String(problem.prompt || "").slice(0, 120),
          issues
        });
      }
    }
  }

  // Registry orphan specs
  for (const [key, raw] of Object.entries(VISUAL_BY_SOURCE)) {
    const issues = [];
    const built = auditSpecTechnical(structuredClone(raw), issues);
    if (built) auditGeometrySanity(raw, built, issues);
    if (!isHandled(raw.method || "area")) {
      issues.push({ severity: "error", code: "unhandled-method", message: `registry method ${raw.method}` });
    }
    if (issues.length) {
      results.push({ id: `VISUAL_BY_SOURCE:${key}`, source: key, method: raw.method, issues });
    }
  }
  for (const [key, raw] of Object.entries(VISUAL_BY_KEY)) {
    const issues = [];
    const built = auditSpecTechnical(structuredClone(raw), issues);
    if (built) auditGeometrySanity(raw, built, issues);
    if (issues.length) {
      results.push({ id: `VISUAL_BY_KEY:${key}`, source: key, method: raw.method, issues });
    }
  }

  // Merge renderer-level issues as a synthetic entry
  if (rendererIssues.length) {
    results.unshift({
      id: "renderer:original-shell.js",
      source: "src/original-shell.js",
      method: "(geometry)",
      issues: rendererIssues
    });
  }

  const errors = results.filter((r) => r.issues.some((i) => i.severity === "error"));
  const warns = results.filter((r) => r.issues.length && !r.issues.some((i) => i.severity === "error"));

  console.log("=== Integral Studio Deep Animation QC ===\n");
  console.log("Method coverage (primary specs):");
  for (const [m, c] of [...methodHist.entries()].sort((a, b) => b[1] - a[1])) {
    const ok = isHandled(m) ? "ok" : "UNHANDLED";
    console.log(`  ${String(c).padStart(4)}  ${m}  [${ok}]`);
  }
  console.log("");
  console.log(`Entries with errors:   ${errors.length}`);
  console.log(`Entries with warnings: ${warns.length}`);
  console.log("");

  const codeCounts = new Map();
  for (const r of results) {
    for (const i of r.issues) {
      const k = `${i.severity}:${i.code}`;
      codeCounts.set(k, (codeCounts.get(k) || 0) + 1);
    }
  }
  console.log("Issue breakdown:");
  for (const [k, c] of [...codeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(4)}  ${k}`);
  }
  console.log("");

  const printEntry = (r) => {
    console.log(`--- ${r.id}`);
    if (r.source) console.log(`    source: ${r.source}`);
    if (r.method) console.log(`    method: ${r.method}`);
    if (r.prompt) console.log(`    prompt: ${r.prompt}`);
    for (const i of r.issues) {
      console.log(`    [${i.severity.toUpperCase()}] ${i.code}: ${i.message}`);
      if (i.prompt) console.log(`           prompt: ${i.prompt}`);
    }
    console.log("");
  };

  if (errors.length) {
    console.log("=== ERRORS ===\n");
    // cap detail
    for (const r of errors.slice(0, 80)) printEntry(r);
    if (errors.length > 80) console.log(`... and ${errors.length - 80} more error entries\n`);
  }

  if (warns.length) {
    console.log("=== WARNINGS ===\n");
    for (const r of warns.slice(0, 40)) printEntry(r);
    if (warns.length > 40) console.log(`... and ${warns.length - 40} more warning entries\n`);
  }

  // Write JSON report
  const reportPath = path.join(__dirname, "../agent-tools/animation-qc-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        methodHist: Object.fromEntries(methodHist),
        errorEntries: errors.length,
        warnEntries: warns.length,
        codeCounts: Object.fromEntries(codeCounts),
        results
      },
      null,
      2
    )
  );
  console.log(`Report written to ${reportPath}`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
