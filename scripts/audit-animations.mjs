/**
 * Audit 3D animation specs against original-shell.js expectations.
 * Run: node scripts/audit-animations.mjs
 */

import { getBriggsProblem, briggsProblemCount } from "../src/briggsProblems.js";
import { VISUAL_BY_SOURCE, VISUAL_BY_KEY } from "../src/briggsVisualSpecs.js";
import { buildExampleFromSpec, compileCurve, SUPPORTED_CURVE_TYPES, SUPPORTED_RENDER_METHODS } from "../src/visualSpecs.js";
import { materializeVisualExample } from "../src/materializeVisual.js";
import { loadBriggsBank } from "../src/briggsProblems.js";

await loadBriggsBank();

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
const DIFFICULTIES = ["easy", "medium", "hard"];

const KNOWN_CURVE_TYPES = new Set(SUPPORTED_CURVE_TYPES);

const METHOD_ORIENTATION = {
  "shell-x": "horizontal",
  "disk-y": "horizontal",
  "washer-y": "horizontal",
  "shell-y": "vertical",
  "disk-x": "vertical",
  "washer-x": "vertical",
  "surface-x": "vertical",
  "surface-y": "either",
  area: "either",
  centroid: "either",
  inertia: "either",
  arc: "either",
  "pump-bowl": "horizontal",
  "pool-fill": "vertical",
  "goat-barn": "geometry",
  "cross-square": "vertical",
  "cross-semicircle": "vertical"
};

/** Methods original-shell.js handles with dedicated render paths. */
const EXPLICIT_RENDER_METHODS = new Set(SUPPORTED_RENDER_METHODS);

function isShellMethod(method) {
  return typeof method === "string" && method.startsWith("shell");
}

function isWasherDiskMethod(method) {
  return ["disk-x", "disk-y", "washer-x", "washer-y"].includes(method);
}

function resolveOrientation(method, specOrientation) {
  if (method === "shell-x" || method === "disk-y" || method === "washer-y") return "horizontal";
  if (method === "surface-y" && specOrientation === "horizontal") return "horizontal";
  if (method === "arc") return specOrientation === "horizontal" ? "horizontal" : "vertical";
  if (
    method === "shell-y" ||
    method === "disk-x" ||
    method === "washer-x" ||
    method === "surface-x" ||
    method === "cross-square" ||
    method === "cross-semicircle"
  ) {
    return "vertical";
  }
  if (["area", "centroid", "inertia"].includes(method)) {
    return specOrientation === "horizontal" ? "horizontal" : "vertical";
  }
  return specOrientation === "horizontal" ? "horizontal" : "vertical";
}

function sampleCurveRange(fn, min, max, steps = 48) {
  let lo = Infinity;
  let hi = -Infinity;
  let finiteCount = 0;
  let nanCount = 0;
  for (let i = 0; i <= steps; i += 1) {
    const t = min + ((max - min) * i) / steps;
    const value = fn(t);
    if (Number.isFinite(value)) {
      finiteCount += 1;
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    } else {
      nanCount += 1;
    }
  }
  if (!Number.isFinite(lo)) return { lo: null, hi: null, finiteCount, nanCount, allNaN: true };
  return { lo, hi, finiteCount, nanCount, allNaN: false };
}

function getSceneBounds(ex) {
  let xMin = 0;
  let xMax = 4;
  let yMin = 0;
  let yMax = 3;

  if (ex.orientation === "vertical") {
    xMin = ex.xMin ?? 0;
    xMax = ex.xMax ?? 4;
    const top = sampleCurveRange(ex.top, xMin, xMax);
    const bottom = sampleCurveRange(ex.bottom, xMin, xMax);
    yMin = Math.min(0, bottom.lo ?? 0, top.lo ?? 0);
    yMax = Math.max(bottom.hi ?? 0, top.hi ?? 0);
    return { xMin, xMax, yMin, yMax, top, bottom };
  }

  yMin = ex.yMin ?? 0;
  yMax = ex.yMax ?? 3;
  const left = sampleCurveRange(ex.left, yMin, yMax);
  const right = sampleCurveRange(ex.right, yMin, yMax);
  xMin = Math.min(0, left.lo ?? 0, right.lo ?? 0);
  xMax = Math.max(left.hi ?? 0, right.hi ?? 0);
  return { xMin, xMax, yMin, yMax, left, right };
}

function describeRouting(method) {
  if (EXPLICIT_RENDER_METHODS.has(method)) return `handled (${method})`;
  if (isShellMethod(method)) return `handled (shell → makeShell)`;
  if (isWasherDiskMethod(method)) return `handled (washer/disk → makeWasherOrDisk)`;
  if (method === "surface-y") {
    return "MISROUTED: surface-y falls through to makeWasherOrDisk in updateScene/rebuildCompletedShells";
  }
  return `UNKNOWN: no render branch in original-shell.js`;
}

function auditCurveSpec(curveSpec, label, issues, ctx) {
  if (!curveSpec) {
    issues.push({
      code: "missing-curve-spec",
      severity: "error",
      message: `${label} is missing`,
      fix: `Add a curve spec object (e.g. { t: "c", v: 0 }) for ${label}`
    });
    return;
  }
  if (!curveSpec.t) {
    issues.push({
      code: "missing-curve-type",
      severity: "error",
      message: `${label} has no "t" type field`,
      fix: `Set ${label}.t to a known curve type`
    });
    return;
  }
  if (!KNOWN_CURVE_TYPES.has(curveSpec.t)) {
    issues.push({
      code: "unknown-curve-type",
      severity: "error",
      message: `${label} uses unknown curve type "${curveSpec.t}" (compileCurve returns constant 0)`,
      fix: `Implement "${curveSpec.t}" in compileCurve or change ${label} to a known type`
    });
  }
  if (curveSpec.t !== "c" && compileCurve(curveSpec)() === 0 && curveSpec.t !== "c") {
    // compileCurve default is () => 0 — already caught by unknown type
  }
  void ctx;
}

function auditSpec(rawSpec, meta) {
  const issues = [];
  const method = rawSpec.method || "area";
  const expectedOrientation = resolveOrientation(method, rawSpec.orientation);
  const built = buildExampleFromSpec(rawSpec);

  if (!built) {
    issues.push({
      code: "build-failed",
      severity: "error",
      message: "buildExampleFromSpec returned null",
      fix: "Provide a valid spec object"
    });
    return { built, issues };
  }

  // --- orientation / method consistency ---
  if (rawSpec.orientation && rawSpec.orientation !== expectedOrientation) {
    issues.push({
      code: "orientation-mismatch",
      severity: "warn",
      message: `spec.orientation="${rawSpec.orientation}" but method "${method}" resolves to "${expectedOrientation}"`,
      fix: `Set orientation to "${expectedOrientation}" or change method to match the intended strip direction`
    });
  }
  if (built.orientation !== expectedOrientation) {
    issues.push({
      code: "built-orientation-mismatch",
      severity: "error",
      message: `built orientation "${built.orientation}" !== expected "${expectedOrientation}" for method "${method}"`,
      fix: "Fix method/orientation pair in the spec"
    });
  }
  if (METHOD_ORIENTATION[method] && !["geometry", "either"].includes(METHOD_ORIENTATION[method])) {
    if (METHOD_ORIENTATION[method] !== expectedOrientation) {
      issues.push({
        code: "method-orientation-table",
        severity: "error",
        message: `internal inconsistency for method "${method}"`,
        fix: "Update METHOD_ORIENTATION table"
      });
    }
  }

  // --- missing bound functions on built example ---
  if (built.orientation === "vertical") {
    for (const key of ["bottom", "top"]) {
      if (typeof built[key] !== "function") {
        issues.push({
          code: "missing-bound-fn",
          severity: "error",
          message: `vertical spec missing compiled "${key}" function (makeRegion/makeSlice will throw)`,
          fix: `Add ${key}: { t: ... } to the spec`
        });
      }
    }
    if (rawSpec.xMin == null || rawSpec.xMax == null) {
      issues.push({
        code: "missing-interval",
        severity: "error",
        message: "vertical spec missing xMin/xMax",
        fix: "Set xMin and xMax on the spec"
      });
    }
    if (rawSpec.xMin != null && rawSpec.xMax != null && rawSpec.xMin >= rawSpec.xMax) {
      issues.push({
        code: "invalid-interval",
        severity: "error",
        message: `xMin (${rawSpec.xMin}) >= xMax (${rawSpec.xMax})`,
        fix: "Ensure xMin < xMax"
      });
    }
    auditCurveSpec(rawSpec.bottom, "bottom", issues, meta);
    auditCurveSpec(rawSpec.top, "top", issues, meta);
  } else if (built.orientation === "horizontal") {
    for (const key of ["left", "right"]) {
      if (typeof built[key] !== "function") {
        issues.push({
          code: "missing-bound-fn",
          severity: "error",
          message: `horizontal spec missing compiled "${key}" function (makeRegion/makeSlice will throw)`,
          fix: `Add ${key}: { t: ... } to the spec`
        });
      }
    }
    if (rawSpec.yMin == null || rawSpec.yMax == null) {
      issues.push({
        code: "missing-interval",
        severity: "error",
        message: "horizontal spec missing yMin/yMax",
        fix: "Set yMin and yMax on the spec"
      });
    }
    if (rawSpec.yMin != null && rawSpec.yMax != null && rawSpec.yMin >= rawSpec.yMax) {
      issues.push({
        code: "invalid-interval",
        severity: "error",
        message: `yMin (${rawSpec.yMin}) >= yMax (${rawSpec.yMax})`,
        fix: "Ensure yMin < yMax"
      });
    }
    auditCurveSpec(rawSpec.left, "left", issues, meta);
    auditCurveSpec(rawSpec.right, "right", issues, meta);
  }

  // --- renderer routing ---
  const routing = describeRouting(method);
  if (routing.startsWith("MISROUTED") || routing.startsWith("UNKNOWN")) {
    issues.push({
      code: "renderer-misroute",
      severity: "error",
      message: routing,
      fix:
        method === "surface-y"
          ? "Add surface-y branches in original-shell.js (like surface-x: makeSurfaceBand about y-axis, or horizontal x(y) strips); do not route to makeWasherOrDisk"
          : `Add a dedicated render path for method "${method}" in updateScene/rebuildCompletedShells`
    });
  }

  // shell/disk/washer axis hints
  if (isShellMethod(method) && method.endsWith("-y") && rawSpec.axisX == null) {
    issues.push({
      code: "missing-axis",
      severity: "warn",
      message: `${method} has no axisX (defaults to 0 in renderer)`,
      fix: "Set axisX and axisLabel for the axis of revolution"
    });
  }
  if (isShellMethod(method) && method.endsWith("-x") && rawSpec.axisY == null) {
    issues.push({
      code: "missing-axis",
      severity: "warn",
      message: `${method} has no axisY (defaults to 0 in renderer)`,
      fix: "Set axisY and axisLabel for the axis of revolution"
    });
  }
  if (isWasherDiskMethod(method) && method.endsWith("-x") && rawSpec.axisY == null) {
    issues.push({
      code: "missing-axis",
      severity: "warn",
      message: `${method} has no axisY (defaults to 0)`,
      fix: "Set axisY for revolution about a horizontal line"
    });
  }
  if (isWasherDiskMethod(method) && method.endsWith("-y") && rawSpec.axisX == null) {
    issues.push({
      code: "missing-axis",
      severity: "warn",
      message: `${method} has no axisX (defaults to 0)`,
      fix: "Set axisX for revolution about a vertical line"
    });
  }

  // --- NaN / invalid bounds from sampling (mirrors getSceneBounds) ---
  try {
    const bounds = getSceneBounds(built);
    if (built.orientation === "vertical") {
      if (bounds.top.allNaN) {
        issues.push({
          code: "nan-curve",
          severity: "error",
          message: `top(x) is entirely non-finite on [${built.xMin}, ${built.xMax}]`,
          fix: "Fix top curve parameters or integration bounds"
        });
      }
      if (bounds.bottom.allNaN) {
        issues.push({
          code: "nan-curve",
          severity: "error",
          message: `bottom(x) is entirely non-finite on [${built.xMin}, ${built.xMax}]`,
          fix: "Fix bottom curve parameters or integration bounds"
        });
      }
      if (!bounds.top.allNaN && !bounds.bottom.allNaN) {
        const steps = 48;
        let inverted = 0;
        for (let i = 0; i <= steps; i += 1) {
          const x = built.xMin + ((built.xMax - built.xMin) * i) / steps;
          if (built.top(x) < built.bottom(x)) inverted += 1;
        }
        const offAxisSurface = method === "surface-x" && rawSpec.axisY != null;
        if (!offAxisSurface && inverted > steps * 0.8) {
          issues.push({
            code: "inverted-bounds",
            severity: "warn",
            message: `top(x) < bottom(x) on most of [${built.xMin}, ${built.xMax}] — region may be empty or swapped`,
            fix: "Swap bottom/top curves or fix bounds"
          });
        }
      }
    } else {
      if (bounds.left?.allNaN) {
        issues.push({
          code: "nan-curve",
          severity: "error",
          message: `left(y) is entirely non-finite on [${built.yMin}, ${built.yMax}]`,
          fix: "Fix left curve parameters or y bounds"
        });
      }
      if (bounds.right?.allNaN) {
        issues.push({
          code: "nan-curve",
          severity: "error",
          message: `right(y) is entirely non-finite on [${built.yMin}, ${built.yMax}]`,
          fix: "Fix right curve parameters or y bounds"
        });
      }
      if (!bounds.left?.allNaN && !bounds.right?.allNaN) {
        const steps = 48;
        let inverted = 0;
        for (let i = 0; i <= steps; i += 1) {
          const y = built.yMin + ((built.yMax - built.yMin) * i) / steps;
          if (built.right(y) < built.left(y)) inverted += 1;
        }
        if (inverted > steps * 0.8) {
          issues.push({
            code: "inverted-bounds",
            severity: "warn",
            message: `right(y) < left(y) on most of [${built.yMin}, ${built.yMax}]`,
            fix: "Swap left/right curves or fix bounds"
          });
        }
      }
    }

    if (!Number.isFinite(bounds.xMin) || !Number.isFinite(bounds.xMax) || !Number.isFinite(bounds.yMin) || !Number.isFinite(bounds.yMax)) {
      issues.push({
        code: "nan-bounds",
        severity: "error",
        message: `scene bounds contain non-finite values: x[${bounds.xMin}, ${bounds.xMax}] y[${bounds.yMin}, ${bounds.yMax}]`,
        fix: "Fix curve specs and domain bounds"
      });
    }
    if (bounds.xMax - bounds.xMin < 1e-6 || bounds.yMax - bounds.yMin < 1e-6) {
      issues.push({
        code: "degenerate-bounds",
        severity: "error",
        message: `degenerate scene extent: x span ${bounds.xMax - bounds.xMin}, y span ${bounds.yMax - bounds.yMin}`,
        fix: "Widen bounds or fix curves that collapse the region"
      });
    }
  } catch (err) {
    issues.push({
      code: "bounds-exception",
      severity: "error",
      message: `getSceneBounds threw: ${err.message}`,
      fix: "Ensure all bound functions are defined and callable"
    });
  }

  // surface-y with vertical x-domain is a semantic mismatch even if it renders
  if (method === "surface-y" && built.orientation === "vertical") {
    issues.push({
      code: "surface-y-vertical-domain",
      severity: "warn",
      message:
        "surface-y uses vertical x-bounds but y-axis surface area typically needs horizontal y-bounds with x(y) as left/right",
      fix:
        "Consider orientation:horizontal, yMin/yMax, left/right = inverse function x(y), and implement makeSurfaceBandY in original-shell.js"
    });
  }

  void meta;
  return { built, issues };
}

function collectSpecsFromProblem(problem, topic, difficulty, index) {
  const entries = [];
  const baseId = `${topic}/${difficulty}#${index}`;
  const label = problem.source || problem.visualKey || problem.title;

  if (!problem.visualSpec) {
    entries.push({
      id: baseId,
      label,
      problem: { source: problem.source, visualKey: problem.visualKey, title: problem.title },
      spec: null,
      variant: "primary",
      issues: [
        {
          code: "no-visual-spec",
          severity: "error",
          message: "Problem has no visualSpec (attachVisualSpec found no match; legacy fallback may differ)",
          fix: "Add entry to VISUAL_BY_SOURCE or VISUAL_BY_KEY"
        }
      ]
    });
    return entries;
  }

  const primary = structuredClone(problem.visualSpec);
  const { issues: primaryIssues } = auditSpec(primary, { id: baseId, variant: "primary" });
  entries.push({
    id: baseId,
    label,
    problem: { source: problem.source, visualKey: problem.visualKey, title: problem.title },
    spec: primary,
    variant: "primary",
    issues: primaryIssues
  });

  if (primary.alternateSpec) {
    const alt = structuredClone(primary.alternateSpec);
    alt.title = alt.title || primary.title;
    const { issues: altIssues } = auditSpec(alt, { id: baseId, variant: "alternate" });
    entries.push({
      id: `${baseId}:alternate`,
      label: `${label} (alternate)`,
      problem: { source: problem.source, visualKey: problem.visualKey, title: problem.title },
      spec: alt,
      variant: "alternate",
      issues: altIssues
    });
  }

  return entries;
}

function collectRegistrySpecs() {
  const entries = [];
  for (const [key, spec] of Object.entries(VISUAL_BY_SOURCE)) {
    const clone = structuredClone(spec);
    const { issues } = auditSpec(clone, { registry: "VISUAL_BY_SOURCE", key });
    entries.push({
      id: `VISUAL_BY_SOURCE:${key}`,
      label: key,
      spec: clone,
      variant: "registry",
      issues
    });
    if (clone.alternateSpec) {
      const alt = structuredClone(clone.alternateSpec);
      alt.title = alt.title || clone.title;
      const altResult = auditSpec(alt, { registry: "VISUAL_BY_SOURCE", key, variant: "alternate" });
      entries.push({
        id: `VISUAL_BY_SOURCE:${key}:alternate`,
        label: `${key} (alternate)`,
        spec: alt,
        variant: "alternate-registry",
        issues: altResult.issues
      });
    }
  }
  for (const [key, spec] of Object.entries(VISUAL_BY_KEY)) {
    const clone = structuredClone(spec);
    const { issues } = auditSpec(clone, { registry: "VISUAL_BY_KEY", key });
    entries.push({
      id: `VISUAL_BY_KEY:${key}`,
      label: key,
      spec: clone,
      variant: "registry",
      issues
    });
  }
  return entries;
}

function collectBriggsSpecs() {
  const entries = [];
  for (const topic of TOPICS) {
    for (const difficulty of DIFFICULTIES) {
      const count = briggsProblemCount(topic, difficulty);
      for (let i = 0; i < count; i += 1) {
        const problem = getBriggsProblem(topic, difficulty, i);
        entries.push(...collectSpecsFromProblem(problem, topic, difficulty, i));
      }
    }
  }
  return entries;
}

function severityRank(s) {
  return s === "error" ? 0 : 1;
}

function printReport(allEntries) {
  const withErrors = allEntries.filter(e => e.issues.some(i => i.severity === "error"));
  const withWarnings = allEntries.filter(
    e => e.issues.length && !e.issues.some(i => i.severity === "error")
  );

  console.log("=== Integral Studio Animation Audit ===\n");
  console.log(`Checked ${allEntries.length} spec entries`);
  console.log(`  Errors:   ${withErrors.length} entries`);
  console.log(`  Warnings: ${withWarnings.length} entries`);
  console.log("");

  const errorCodes = new Map();
  for (const entry of withErrors) {
    for (const issue of entry.issues.filter(i => i.severity === "error")) {
      errorCodes.set(issue.code, (errorCodes.get(issue.code) || 0) + 1);
    }
  }
  if (errorCodes.size) {
    console.log("Error breakdown:");
    for (const [code, count] of [...errorCodes.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${code}: ${count}`);
    }
    console.log("");
  }

  for (const entry of [...withErrors].sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`--- ${entry.id}`);
    console.log(`    ${entry.label}`);
    if (entry.problem) {
      console.log(
        `    problem: source=${entry.problem.source ?? "-"} visualKey=${entry.problem.visualKey ?? "-"}`
      );
    }
    if (entry.spec?.method) {
      console.log(
        `    method=${entry.spec.method} orientation=${entry.spec.orientation ?? "(derived)"}`
      );
    }
    const sorted = [...entry.issues].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity)
    );
    for (const issue of sorted) {
      console.log(`    [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`);
      console.log(`           fix: ${issue.fix}`);
    }
    console.log("");
  }

  if (withWarnings.length) {
    console.log("=== Warnings (non-fatal) ===\n");
    for (const entry of withWarnings) {
      console.log(`--- ${entry.id} — ${entry.label}`);
      for (const issue of entry.issues) {
        console.log(`    [WARN] ${issue.code}: ${issue.message}`);
        console.log(`           fix: ${issue.fix}`);
      }
      console.log("");
    }
  }

  return withErrors.length;
}

const briggsEntries = collectBriggsSpecs();
const registryEntries = collectRegistrySpecs();

// Deduplicate by id (briggs entries are authoritative for problems; registry catches orphans)
const byId = new Map();
for (const entry of registryEntries) byId.set(entry.id, entry);
for (const entry of briggsEntries) byId.set(entry.id, entry);

const allEntries = [...byId.values()];
const errorCount = printReport(allEntries);
process.exit(errorCount > 0 ? 1 : 0);
