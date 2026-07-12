/**
 * Serializable curve specs for the Three.js animation.
 * Each curve is { t: type, ...params } and compiled to a function at runtime.
 */

export const SUPPORTED_CURVE_TYPES = Object.freeze([
  "c", "lin", "pow", "pow-shift", "sqrt", "poly", "rat", "samples", "piecewise",
  "exp", "quad", "sin", "cos", "cosh", "sinh", "cos2", "sqrt-shift", "sub-u-power",
  "inv-sqrt-minus-recip", "sec2", "csc2", "sec-tan", "lin-cos", "lin-sin", "trig-combo",
  "exp-plus-recip", "exp-lin-recip", "sub-u-gen", "sub-u-linear", "pow-sqrt", "log", "recip",
  "recip-quad", "inv-sqrt-unit", "inv-sqrt", "neg-log", "sqrt-inv", "sqrt-inv-cap",
  "inv-quad-hi", "inv-quad-lo", "circle-half-y", "circle-upper"
]);

export const SUPPORTED_RENDER_METHODS = Object.freeze([
  "area", "centroid", "inertia", "arc", "surface-x", "surface-y", "pump-bowl", "pool-fill",
  "goat-barn", "cross-square", "cross-semicircle", "shell-x", "shell-y", "disk-x", "disk-y",
  "washer-x", "washer-y"
]);

export function compileCurve(spec) {
  if (!spec) return () => 0;
  switch (spec.t) {
    case "c":
      return () => spec.v;
    case "lin":
      return x => spec.a * x + (spec.b ?? 0);
    case "pow":
      return x => spec.a * Math.pow(x, spec.n);
    case "pow-shift":
      return x => (spec.b ?? 0) + (spec.a ?? 1) * Math.pow(Math.max(0, x - (spec.s ?? 0)), spec.n ?? 1);
    case "sqrt":
      return x => (spec.b ?? 0) + spec.a * Math.sqrt(Math.max(0, x));
    case "poly": {
      const k = spec.k || [];
      return x => k.reduce((sum, coef, i) => sum + coef * Math.pow(x, i), 0);
    }
    case "rat": {
      // Rational: num(x)/den(x) with low→high coefficient arrays
      const num = spec.num || [0];
      const den = spec.den || [1];
      const evalPoly = (k, x) => k.reduce((sum, coef, i) => sum + coef * Math.pow(x, i), 0);
      return x => {
        const d = evalPoly(den, x);
        if (Math.abs(d) < 1e-9) return 0;
        return evalPoly(num, x) / d;
      };
    }
    case "samples": {
      // Piecewise-linear interpolation through (xs[i], ys[i])
      const xs = spec.xs || [];
      const ys = spec.ys || [];
      if (!xs.length || xs.length !== ys.length) return () => 0;
      return x => {
        if (x <= xs[0]) return ys[0];
        if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
        let i = 0;
        while (i < xs.length - 1 && xs[i + 1] < x) i += 1;
        const x0 = xs[i];
        const x1 = xs[i + 1];
        const t = (x - x0) / Math.max(x1 - x0, 1e-12);
        return ys[i] + t * (ys[i + 1] - ys[i]);
      };
    }
    case "piecewise": {
      const segments = (spec.segments || []).map(seg => ({
        min: seg.min ?? -Infinity,
        max: seg.max ?? Infinity,
        fn: compileCurve(seg.curve)
      }));
      return x => {
        const seg = segments.find(s => x >= s.min && x <= s.max) || segments[segments.length - 1];
        return seg ? seg.fn(x) : 0;
      };
    }
    case "exp":
      // s*exp(a*x) + b  (b is optional vertical shift)
      return x => (spec.b ?? 0) + (spec.s ?? 1) * Math.exp((spec.a ?? 0) * x);
    case "quad":
      return x => spec.a * x * ((spec.b ?? 1) - x);
    case "sin":
      // a*sin(w*x+p) + b
      return x => (spec.b ?? 0) + (spec.a ?? 1) * Math.sin((spec.w ?? 1) * x + (spec.p ?? 0));
    case "cos":
      // a*cos(w*x+p) + b
      return x => (spec.b ?? 0) + (spec.a ?? 1) * Math.cos((spec.w ?? 1) * x + (spec.p ?? 0));
    case "cosh": {
      // a * cosh(x/a)  (catenary) — if scale provided use a*cosh(x/scale)
      const a = spec.a ?? 1;
      const scale = spec.scale ?? a;
      return x => a * Math.cosh(x / Math.max(scale, 1e-9));
    }
    case "sinh": {
      const a = spec.a ?? 1;
      const scale = spec.scale ?? 1;
      return x => a * Math.sinh(x / Math.max(scale, 1e-9));
    }
    case "cos2":
      return x => (spec.a ?? 1) * Math.pow(Math.cos(x), 2);
    case "sqrt-shift":
      return t => (spec.b ?? 0) + (spec.a ?? 1) * Math.sqrt(Math.max(0, t - (spec.s ?? 0)));
    case "sub-u-power":
      return x => (spec.a ?? 1) * x * Math.pow((spec.b ?? 1) * Math.pow(x, spec.n ?? 2) + (spec.c ?? 1), spec.p ?? 4);
    case "inv-sqrt-minus-recip":
      return x =>
        (spec.a ?? 4) / Math.sqrt(Math.max(1e-6, 1 - x * x)) -
        (spec.b ?? 3) / Math.max(Math.abs(x), 1e-6);
    case "sec2":
      return x => (spec.a ?? 1) / Math.pow(Math.cos(x), 2);
    case "csc2":
      return x => (spec.a ?? 1) / Math.pow(Math.sin(x), 2);
    case "sec-tan":
      return x => Math.sin(x) / Math.pow(Math.cos(x), 2);
    case "lin-cos":
      return x => (spec.a ?? 0) * x + (spec.b ?? 0) * Math.cos(x);
    case "lin-sin":
      // a*x + b*sin(w*x+p) + c
      return x =>
        (spec.a ?? 0) * x +
        (spec.b ?? 1) * Math.sin((spec.w ?? 1) * x + (spec.p ?? 0)) +
        (spec.c ?? 0);
    case "trig-combo":
      return x => {
        let y = (spec.sin ?? 0) * Math.sin(x) + (spec.cos ?? 0) * Math.cos(x);
        if (spec.sec2) {
          const c = Math.cos(x);
          y += (spec.sec2) / Math.max(c * c, 1e-6);
        }
        if (spec.csc2) {
          const s = Math.sin(x);
          y += (spec.csc2) / Math.max(s * s, 1e-6);
        }
        return y;
      };
    case "exp-plus-recip":
      return x => (spec.s ?? 1) * Math.exp((spec.a ?? 1) * x) + (spec.r ?? 1) / Math.max(Math.abs(x), 1e-6);
    case "exp-lin-recip":
      // lin*x + s*exp(a*x) + r/x + c
      return x =>
        (spec.lin ?? 0) * x +
        (spec.s ?? 0) * Math.exp((spec.a ?? 1) * x) +
        (spec.r ?? 0) / Math.max(Math.abs(x), 1e-6) +
        (spec.c ?? 0);
    case "sub-u-gen":
      // a * x^(n-1) * (b*x^n + c)^p   (covers 3x^2(x^3+2)^3 etc.)
      return x => {
        const n = spec.n ?? 2;
        const a = spec.a ?? 1;
        const b = spec.b ?? 1;
        const c = spec.c ?? 1;
        const p = spec.p ?? 1;
        const base = b * Math.pow(x, n) + c;
        return a * Math.pow(Math.max(0, x), Math.max(0, n - 1)) * Math.pow(base, p);
      };
    case "sub-u-linear":
      // (a*x + d) * (poly coeffs k)^p  where poly is evaluated at x
      return x => {
        const linear = (spec.a ?? 0) * x + (spec.d ?? 0);
        const k = spec.k || [0, 0, 1];
        const poly = k.reduce((sum, coef, i) => sum + coef * Math.pow(x, i), 0);
        return linear * Math.pow(poly, spec.p ?? 1);
      };
    case "pow-sqrt":
      return x => (spec.a ?? 0) * Math.pow(x, spec.n ?? 1) + (spec.b ?? 0) - (spec.c ?? 0) * Math.sqrt(Math.max(0, x));
    case "log":
      return x => (spec.a ?? 1) * Math.log(Math.max(Math.abs(x), 1e-6));
    case "recip":
      return x => (spec.a ?? 1) / Math.max(Math.abs(x), 1e-6);
    case "recip-quad":
      return x => (spec.a ?? 1) / Math.max((spec.b ?? 1) * x * x + (spec.c ?? 1), 1e-6);
    case "inv-sqrt-unit":
      return x => (spec.a ?? 1) / Math.sqrt(Math.max(1e-6, 1 - x * x));
    case "inv-sqrt":
      // a / sqrt(R^2 - (x - h)^2)
      return x => {
        const R = spec.R ?? 1;
        const h = spec.h ?? 0;
        const inside = R * R - (x - h) * (x - h);
        return (spec.a ?? 1) / Math.sqrt(Math.max(1e-6, inside));
      };
    case "neg-log":
      return y => -Math.log(Math.max(y, 1e-6));
    case "sqrt-inv":
      return y => Math.sqrt(Math.max(0, (spec.a ?? 0) - y));
    case "sqrt-inv-cap":
      return y => Math.min(spec.cap ?? 1, Math.sqrt(Math.max(0, (spec.a ?? 0) - y)));
    case "inv-quad-hi":
      return y => 0.5 * ((spec.b ?? 1) + Math.sqrt(Math.max(0, (spec.b ?? 1) ** 2 - 4 * y / (spec.a ?? 1))));
    case "inv-quad-lo":
      return y => 0.5 * ((spec.b ?? 1) - Math.sqrt(Math.max(0, (spec.b ?? 1) ** 2 - 4 * y / (spec.a ?? 1))));
    case "circle-half-y":
      return y =>
        (spec.s ?? 1) * Math.sqrt(Math.max(0, (spec.R ?? 1) ** 2 - (y - (spec.cy ?? 0)) ** 2));
    case "circle-upper":
      return x =>
        (spec.cy ?? 0) + Math.sqrt(Math.max(0, (spec.R ?? 1) ** 2 - (x - (spec.cx ?? 0)) ** 2));
    default:
      return () => 0;
  }
}

function compileBound(spec) {
  if (!spec) return () => 0;
  if (spec.t === "c") return () => spec.v;
  return compileCurve(spec);
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
  return specOrientation === "horizontal" ? "horizontal" : "vertical";
}

export function buildExampleFromSpec(spec) {
  if (!spec) return null;
  const method = spec.method || "area";
  const orientation = resolveOrientation(method, spec.orientation);
  const example = {
    title: String(spec.title || "Problem"),
    subtitle: String(spec.subtitle || ""),
    orientation,
    method: String(method),
    // Coerce formula lines to plain strings (rendered via textContent, never innerHTML).
    formula: (Array.isArray(spec.formula) ? spec.formula : []).map(line => String(line ?? "")),
    sampleLabel: String(spec.sampleLabel || "sample x"),
    measureLabel: String(spec.measureLabel || "strip height")
  };

  if (spec.axisLabel) example.axisLabel = spec.axisLabel;
  if (spec.axisX != null) example.axisX = spec.axisX;
  if (spec.axisY != null) example.axisY = spec.axisY;
  if (spec.bowlRadius != null) example.bowlRadius = Number(spec.bowlRadius);
  if (spec.bowlCenterY != null) example.bowlCenterY = Number(spec.bowlCenterY);
  if (spec.spoutHeight != null) example.spoutHeight = Number(spec.spoutHeight);
  if (spec.marker) example.marker = spec.marker;
  // Composite / cutout metadata for centroid animations (L-shapes, etc.).
  if (spec.cutout) example.cutout = spec.cutout;
  if (Array.isArray(spec.parts) && spec.parts.length) example.parts = spec.parts;

  // Breakpoints for piecewise silhouettes (sharp L-corners, step tops).
  const breaks = [];
  if (spec.cutout?.xMin != null) breaks.push(Number(spec.cutout.xMin));
  if (spec.cutout?.xMax != null) breaks.push(Number(spec.cutout.xMax));
  const collectBreaks = curve => {
    if (curve?.t === "piecewise" && Array.isArray(curve.segments)) {
      for (const seg of curve.segments) {
        if (seg.min != null) breaks.push(Number(seg.min));
        if (seg.max != null) breaks.push(Number(seg.max));
      }
    }
  };
  collectBreaks(spec.top);
  collectBreaks(spec.bottom);
  if (breaks.length) {
    example.piecewiseBreaks = [...new Set(breaks.filter(Number.isFinite))];
  }

  if (orientation === "vertical") {
    example.xMin = spec.xMin ?? 0;
    example.xMax = spec.xMax ?? 1;
    example.bottom = compileBound(spec.bottom ?? { t: "c", v: 0 });
    example.top = compileBound(spec.top ?? { t: "lin", a: 1 });
  } else {
    example.yMin = spec.yMin ?? 0;
    example.yMax = spec.yMax ?? 1;
    example.left = compileBound(spec.left ?? { t: "c", v: 0 });
    example.right = compileBound(spec.right ?? { t: "lin", a: 1 });
  }

  return example;
}

const LEGACY_MODES = {
  area: "area",
  volume: "volume",
  centroid: "centroid",
  curve: "arc",
  surface: "surface",
  inertia: "inertia"
};

export function buildLegacySpec(problem, { alternate = false } = {}) {
  const { a = 1, b = 1, n = 1 } = problem.given || {};
  const mode = LEGACY_MODES[problem.visual] || "area";
  const useWashers = alternate;

  if (mode === "area") {
    return {
      title: "Area",
      subtitle: `Area under y = ${a}x from x = 0 to x = ${b}.`,
      orientation: "vertical",
      method: "area",
      xMin: 0,
      xMax: b,
      bottom: { t: "c", v: 0 },
      top: { t: "lin", a }
    };
  }

  if (mode === "centroid") {
    return {
      title: "Centroid",
      subtitle: `Centroid of a triangle with base ${b} and height ${a}.`,
      orientation: "vertical",
      method: "area",
      xMin: 0,
      xMax: b,
      bottom: { t: "c", v: 0 },
      top: { t: "lin", a, b: 0 },
      marker: { x: b / 3, y: a / 3 }
    };
  }

  if (mode === "inertia") {
    return {
      title: "Moment of inertia",
      subtitle: `Rectangle with base ${b} and height ${a}.`,
      orientation: "vertical",
      method: "area",
      xMin: 0,
      xMax: b,
      bottom: { t: "c", v: 0 },
      top: { t: "c", v: a }
    };
  }

  if (mode === "arc") {
    return {
      title: "Arc length",
      subtitle: `Arc length of y = ${a}x + ${b} on [0, ${n}].`,
      orientation: "vertical",
      method: "arc",
      axisLabel: "none",
      xMin: 0,
      xMax: n,
      bottom: { t: "c", v: 0 },
      top: { t: "lin", a, b },
      formula: [`f'(x)=${a}`, `ds=\\sqrt{1+${a * a}}\\,dx`]
    };
  }

  if (mode === "surface") {
    return {
      title: "Surface area",
      subtitle: `Rotate y = ${a}x + ${b} about the x-axis on [0, ${n}].`,
      orientation: "vertical",
      method: "surface-x",
      axisLabel: "y = 0",
      axisY: 0,
      xMin: 0,
      xMax: n,
      bottom: { t: "c", v: 0 },
      top: { t: "lin", a, b },
      formula: [`f'(x)=${a}`, `dS=2\\pi(${a}x+${b})\\sqrt{1+${a * a}}\\,dx`]
    };
  }

  return {
    title: "Volume",
    subtitle: `Vertical strips → shells about the y-axis for y = ${a}x on [0, ${b}].`,
    orientation: "vertical",
    method: "shell-y",
    axisLabel: "x = 0",
    axisX: 0,
    xMin: 0,
    xMax: b,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a },
    formula: ["r=x", `h=${a}x`, `dV=2\\pi x(${a}x)\\,dx`],
    alternateSpec: {
      subtitle: `Horizontal strips → disks about the y-axis. Same region, integrate in y.`,
      orientation: "horizontal",
      method: "washer-y",
      axisLabel: "x = 0",
      axisX: 0,
      yMin: 0,
      yMax: a * b,
      left: { t: "lin", a: 1 / a },
      right: { t: "c", v: b },
      formula: ["R=b", "r=y/a", "dV=\\pi\\left(b^2-(y/a)^2\\right)\\,dy"]
    }
  };
}

export function resolveVisualSpec(problem, { alternate = false } = {}) {
  const base = problem.visualSpec || buildLegacySpec(problem, { alternate });
  if (!base) return null;
  if (alternate && base.alternateSpec) {
    const alt = structuredClone(base.alternateSpec);
    alt.title = alt.title || base.title;
    return alt;
  }
  const spec = structuredClone(base);
  delete spec.alternateSpec;
  return spec;
}

export function problemHasDualMethod(problem) {
  if (problem.dualMethod === false) return false;
  if (problem.dualMethod === true) return true;
  return Boolean(problem.visualSpec?.alternateSpec || problem.alternateSteps?.length);
}
