/** Animation specs keyed by Briggs problem source tag. */

import { compileCurve } from "./visualSpecs.js";
import { SPEC_PROVENANCE } from "./visualSpecSchema.js";

export const VISUAL_BY_SOURCE = {
  "Briggs §4.9, Ex. 1a": {
    title: "Antiderivative",
    subtitle: "The integrand 3x² is the rate; area accumulates to x³.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "pow", a: 3, n: 2 }
  },
  "Briggs §4.9, Table 4.9": {
    title: "Antiderivative",
    subtitle: "Area under y = cos x accumulates to sin x.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 3.14,
    bottom: { t: "c", v: 0 },
    top: { t: "cos", a: 1 }
  },
  "Briggs §4.9, Ex. 3a": {
    title: "Antiderivative",
    subtitle: "sec² x is the derivative of tan x — watch the slope grow.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1.2,
    bottom: { t: "c", v: 0 },
    top: { t: "sec2" }
  },
  "Briggs §4.9, Ex. 5a": {
    title: "Antiderivative",
    subtitle: "The integrand 1/x becomes ln|x| when accumulated.",
    orientation: "vertical",
    method: "area",
    xMin: 0.5,
    xMax: 4,
    bottom: { t: "c", v: 0 },
    top: { t: "recip", a: 1 }
  },
  "Briggs §4.9, Ex. 2a": {
    title: "Antiderivative",
    subtitle: "Integrand 3x⁵ + 2 − 5√x split into power and root terms.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 0.15,
    bottom: { t: "c", v: 0 },
    top: { t: "pow-sqrt", a: 3, n: 5, b: 2, c: 5 }
  },
  "Briggs §4.9, Ex. 3b": {
    title: "Antiderivative",
    subtitle: "Polynomial 2x plus trig term 3 cos x.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "lin-cos", a: 2, b: 3 }
  },
  "Briggs §4.9, Ex. 3c": {
    title: "Antiderivative",
    subtitle: "sin x / cos² x rewritten as sec x tan x.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1,
    bottom: { t: "c", v: 0 },
    top: { t: "sec-tan" }
  },
  "Briggs §4.9, Ex. 5c": {
    title: "Antiderivative",
    subtitle: "Inverse trig and log terms combined in one integrand.",
    orientation: "vertical",
    method: "area",
    xMin: 0.2,
    xMax: 0.85,
    bottom: { t: "c", v: 0 },
    top: { t: "inv-sqrt-minus-recip", a: 4, b: 3 }
  },
  "Briggs §5.5, Ex. 7": {
    title: "Substitution",
    subtitle: "Inner function u = x² + 1 with factor 2x in the integrand.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1.0,
    bottom: { t: "c", v: 0 },
    top: { t: "sub-u-power", a: 2, b: 1, n: 2, c: 1, p: 4 },
    sampleLabel: "sample x",
    measureLabel: "strip height f(x)"
  },

  "Briggs §5.1, Ex. 3": {
    title: "Area",
    subtitle: "Exact area under y = 3√x from x = 4 to x = 16.",
    orientation: "vertical",
    method: "area",
    xMin: 4,
    xMax: 16,
    bottom: { t: "c", v: 0 },
    top: { t: "sqrt", a: 3 }
  },
  "Briggs §5.3, Ex. 6": {
    title: "Definite integral",
    subtitle: "Area under y = x³ + 1 from x = 0 to x = 2.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "poly", k: [1, 0, 0, 1] }
  },
  "Briggs §6.3, Ex. 17": {
    title: "Volume",
    subtitle: "Vertical strips ⊥ to the x-axis → disks. Region under y = 2x on [0, 3].",
    orientation: "vertical",
    method: "disk-x",
    axisLabel: "y = 0",
    axisY: 0,
    xMin: 0,
    xMax: 3,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 2 },
    formula: ["R=2x", "dV=\\pi(2x)^2\\,dx", "V=36\\pi"],
    alternateSpec: {
      subtitle: "Horizontal strips ⊥ to the x-axis → shells. Same solid, integrate in y.",
      orientation: "horizontal",
      method: "shell-x",
      axisLabel: "y = 0",
      axisY: 0,
      yMin: 0,
      yMax: 6,
      left: { t: "c", v: 0 },
      right: { t: "lin", a: 0.5 },
      formula: ["r=y", "h=y/2", "dV=2\\pi y(y/2)\\,dy", "V=36\\pi"]
    }
  },
  "Briggs §5.3, Ex. 23": {
    title: "Definite integral",
    subtitle: "Area under y = x² − 2x + 3 on [0, 1].",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1,
    bottom: { t: "c", v: 0 },
    top: { t: "poly", k: [3, -2, 1] }
  },
  "Briggs §5.5": {
    title: "Substitution",
    subtitle: "Area under cos² u on [0, π/2] via half-angle identity.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1.57,
    bottom: { t: "c", v: 0 },
    top: { t: "cos2", a: 1 }
  },
  "Briggs §6.2": {
    title: "Area between curves",
    subtitle: "Region between y = 2 − x² and y = x on [0, 1].",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1,
    bottom: { t: "lin", a: 1 },
    top: { t: "poly", k: [2, 0, -1] }
  },

  "Briggs §6.4, Ex. 9": {
    title: "Volume",
    subtitle: "Vertical strips parallel to the y-axis → shells about x = 0.",
    orientation: "vertical",
    method: "shell-y",
    axisLabel: "x = 0",
    axisX: 0,
    xMin: 0,
    xMax: 1,
    bottom: { t: "c", v: 0 },
    top: { t: "quad", a: 1, b: 1 },
    formula: ["r=x", "h=x-x^2", "dV=2\\pi x(x-x^2)\\,dx"],
    alternateSpec: {
      subtitle: "Horizontal strips → disks about the y-axis. Solve x from y = x − x².",
      orientation: "horizontal",
      method: "disk-y",
      axisLabel: "x = 0",
      axisX: 0,
      yMin: 0,
      yMax: 0.25,
      left: { t: "inv-quad-lo", a: 1, b: 1 },
      right: { t: "inv-quad-hi", a: 1, b: 1 },
      formula: ["R=x(y)", "dV=\\pi x(y)^2\\,dy"]
    }
  },
  "Briggs §6.4, Ex. 11": {
    title: "Volume",
    subtitle: "Vertical strips → shells about the y-axis for the triangular region.",
    orientation: "vertical",
    method: "shell-y",
    axisLabel: "x = 0",
    axisX: 0,
    xMin: 0,
    xMax: 1,
    bottom: { t: "lin", a: 3 },
    top: { t: "c", v: 3 },
    formula: ["r=x", "h=3-3x", "dV=2\\pi x(3-3x)\\,dx"],
    alternateSpec: {
      subtitle: "Horizontal strips → disks about the y-axis. At height y, radius is x = y/3.",
      orientation: "horizontal",
      method: "disk-y",
      axisLabel: "x = 0",
      axisX: 0,
      yMin: 0,
      yMax: 3,
      left: { t: "c", v: 0 },
      right: { t: "lin", a: 1 / 3 },
      formula: ["R=y/3", "dV=\\pi(y/3)^2\\,dy"]
    }
  },
  "Briggs §6.4, Ex. 5": {
    title: "Volume",
    subtitle: "Vertical strips → shells about the y-axis between y = x and y = 2 − x².",
    orientation: "vertical",
    method: "shell-y",
    axisLabel: "x = 0",
    axisX: 0,
    xMin: 0,
    xMax: 1,
    bottom: { t: "lin", a: 1 },
    top: { t: "poly", k: [2, 0, -1] },
    alternateSpec: {
      subtitle: "Horizontal strips → washers about the y-axis. Outer x from the parabola, inner from the line.",
      orientation: "horizontal",
      method: "washer-y",
      axisLabel: "x = 0",
      axisX: 0,
      yMin: 0,
      yMax: 1,
      left: { t: "lin", a: 1, b: 0 },
      right: { t: "sqrt-inv-cap", a: 2, cap: 1 },
      formula: ["R=\\sqrt{2-y}", "r=y", "dV=\\pi[(\\sqrt{2-y})^2-y^2]\\,dy"]
    }
  },
  "Briggs §6.3, Ex. 19": {
    title: "Volume",
    subtitle: "Vertical strips → disks about the x-axis for y = e^{−x}.",
    orientation: "vertical",
    method: "disk-x",
    axisLabel: "y = 0",
    axisY: 0,
    xMin: 0,
    xMax: 1.39,
    bottom: { t: "c", v: 0 },
    top: { t: "exp", a: -1 },
    formula: ["R=e^{-x}", "dV=\\pi e^{-2x}\\,dx"],
    alternateSpec: {
      subtitle: "Horizontal strips → shells about the x-axis. Solve x = −ln y.",
      orientation: "horizontal",
      method: "shell-x",
      axisLabel: "y = 0",
      axisY: 0,
      yMin: 0.02,
      yMax: 1,
      left: { t: "c", v: 0 },
      right: { t: "neg-log" },
      formula: ["r=y", "h=-\\ln y", "dV=2\\pi y(-\\ln y)\\,dy"]
    }
  },
  "Briggs §6.4, Example 5": {
    title: "Volume",
    subtitle: "Vertical strips → washers about the x-axis between y = x and y = 2x − x².",
    orientation: "vertical",
    method: "washer-x",
    axisLabel: "y = 0",
    axisY: 0,
    xMin: 0,
    xMax: 1,
    bottom: { t: "lin", a: 1 },
    top: { t: "quad", a: 1, b: 2 },
    formula: ["R=2x-x^2", "r=x", "dV=\\pi\\big((2x-x^2)^2-x^2\\big)\\,dx"],
    alternateSpec: {
      subtitle: "Horizontal strips → shells about the x-axis. At height y, span runs from x = y to x = 1.",
      orientation: "horizontal",
      method: "shell-x",
      axisLabel: "y = 0",
      axisY: 0,
      yMin: 0,
      yMax: 1,
      left: { t: "lin", a: 1, b: 0 },
      right: { t: "c", v: 1 },
      formula: ["r=y", "h=1-y", "dV=2\\pi y(1-y)\\,dy"]
    }
  },

  "Briggs §6.5, Ex. 7": {
    title: "Arc length",
    subtitle: "Hypotenuse segments along y = 2x + 1 from x = 1 to x = 5.",
    orientation: "vertical",
    method: "arc",
    axisLabel: "none",
    xMin: 1,
    xMax: 5,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 2, b: 1 },
    formula: ["f'(x)=2", "ds=\\sqrt{5}\\,dx", "L=4\\sqrt{5}"]
  },
  "Briggs §6.5, Ex. 8": {
    title: "Arc length",
    subtitle: "Constant slope on y = 4 − 3x from x = −3 to x = 2.",
    orientation: "vertical",
    method: "arc",
    axisLabel: "none",
    xMin: -3,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -3, b: 4 },
    formula: ["f'(x)=-3", "ds=\\sqrt{10}\\,dx", "L=5\\sqrt{10}"]
  },
  "Briggs §6.5, Ex. 1": {
    title: "Arc length",
    subtitle: "Refining hypotenuse segments on y = x^{3/2} from x = 0 to x = 4.",
    orientation: "vertical",
    method: "arc",
    axisLabel: "none",
    xMin: 0,
    xMax: 4,
    bottom: { t: "c", v: 0 },
    top: { t: "pow", a: 1, n: 1.5 },
    formula: ["f'(x)=\\frac{3}{2}x^{1/2}", "ds=\\sqrt{1+\\frac{9x}{4}}\\,dx"]
  },
  "Briggs §6.5, Ex. 34": {
    title: "Arc length",
    subtitle: "Line segment length formula on y = 5x − 1 from x = 0 to x = 3.",
    orientation: "vertical",
    method: "arc",
    axisLabel: "none",
    xMin: 0,
    xMax: 3,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 5, b: -1 },
    formula: ["f'(x)=5", "ds=\\sqrt{26}\\,dx", "L=3\\sqrt{26}"]
  },

  "Briggs §6.6, Ex. 7": {
    title: "Surface area",
    subtitle: "Rotate y = 3x + 4 about the x-axis from x = 0 to x = 6.",
    orientation: "vertical",
    method: "surface-x",
    axisLabel: "y = 0",
    axisY: 0,
    xMin: 0,
    xMax: 6,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 3, b: 4 },
    formula: ["f'(x)=3", "ds=\\sqrt{10}\\,dx", "dS=2\\pi(3x+4)\\sqrt{10}\\,dx"]
  },
  "Briggs §6.6, Getting Started Ex. 5": {
    title: "Surface area",
    subtitle: "Line y = 2 − x on [0, 2] rotated about the x-axis.",
    orientation: "vertical",
    method: "surface-x",
    axisLabel: "y = 0",
    axisY: 0,
    xMin: 0,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -1, b: 2 },
    formula: ["f'(x)=-1", "ds=\\sqrt{2}\\,dx", "S=4\\pi\\sqrt{2}"]
  },
  "Briggs §6.6, Ex. 8": {
    title: "Surface area",
    subtitle: "Rotate y = 12 − 3x about the x-axis from x = 1 to x = 3.",
    orientation: "vertical",
    method: "surface-x",
    axisLabel: "y = 0",
    axisY: 0,
    xMin: 1,
    xMax: 3,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -3, b: 12 },
    formula: ["f'(x)=-3", "ds=\\sqrt{10}\\,dx"]
  },
  "Briggs §6.6, Getting Started Ex. 6": {
    title: "Surface area",
    subtitle: "Vertical segment x = 3 from y = 0 to y = 8 sweeps a cylinder.",
    orientation: "vertical",
    method: "area",
    xMin: 2.85,
    xMax: 3.15,
    bottom: { t: "c", v: 0 },
    top: { t: "c", v: 8 },
    formula: ["r=3", "S=2\\pi\\int_0^8 3\\,dy=48\\pi"]
  },
  "Briggs §6.6, Ex. 12": {
    title: "Surface area (y-axis)",
    subtitle: "Rotate y = x²/4 about the y-axis — use x = 2√y.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 1,
    yMax: 4,
    left: { t: "c", v: 0 },
    right: { t: "sqrt", a: 2 },
    formula: ["x=2\\sqrt{y}", "dS=2\\pi(2\\sqrt{y})\\sqrt{1+\\frac{1}{y}}\\,dy"]
  },
  "Briggs §6.6, Ex. 15": {
    title: "Surface area (y-axis)",
    subtitle: "Rotate y = 4x − 1 about the y-axis via x = (y+1)/4.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 3,
    yMax: 15,
    left: { t: "c", v: 0 },
    right: { t: "lin", a: 0.25, b: 0.25 },
    formula: ["x=\\frac{y+1}{4}", "dS=2\\pi\\frac{y+1}{4}\\sqrt{1+\\frac{1}{16}}\\,dy"]
  },
  "Briggs §6.6, Ex. 11": {
    title: "Surface area (y-axis)",
    subtitle: "Rotate y = ∛(3x) about the y-axis — invert to x = y³/3.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 0,
    yMax: 2,
    left: { t: "c", v: 0 },
    right: { t: "pow", a: 1 / 3, n: 3 },
    formula: ["x=\\frac{y^3}{3}", "dS=2\\pi\\frac{y^3}{3}\\sqrt{1+y^4}\\,dy"]
  },
  "Briggs §6.6, Ex. 26": {
    title: "Surface area (y-axis)",
    subtitle: "Rotate y = eˣ about the y-axis via x = ln y.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 1,
    yMax: 2.718281828459045,
    left: { t: "c", v: 0 },
    right: { t: "log", a: 1 },
    formula: ["x=\\ln y", "dS=2\\pi(\\ln y)\\sqrt{1+\\frac{1}{y^2}}\\,dy"]
  },

  "Briggs §6.7, Ex. 1": {
    title: "Variable density",
    subtitle: "Linear density ρ(x) = 1 + x² on a 2-meter bar — slice and sum mass.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "poly", k: [1, 0, 1] },
    formula: ["\\rho(x)=1+x^2", "dm=\\rho(x)\\,dx", "m=\\int_0^2(1+x^2)\\,dx"]
  },
  "Briggs §6.7, Ex. 2": {
    title: "Spring work",
    subtitle: "Hooke's law F(x) = 100x — work is area under the force curve.",
    orientation: "vertical",
    method: "area",
    xMin: -0.5,
    xMax: 0.5,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 100 },
    formula: ["F(x)=100x", "dW=F(x)\\,dx", "W=\\int F(x)\\,dx"]
  },
  "Briggs §6.7, Ex. 3": {
    title: "Lifting a chain",
    subtitle: "Each link at height y travels 10 − y meters — work requires integration.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 10,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -1, b: 10 },
    formula: ["dW=\\rho g(10-y)\\,dy", "W=1.5g\\int_0^{10}(10-y)\\,dy"]
  },
  "Briggs §6.7, Ex. 4": {
    title: "Pumping water",
    subtitle: "Cylindrical tank r = 5 m, h = 10 m — pump to 15 m above bottom.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 10,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -1, b: 15 },
    formula: ["A=25\\pi", "D(y)=15-y", "dW=25\\pi\\rho g(15-y)\\,dy"]
  },
  "OpenStax Vol. 1 §6.5 / Briggs application concept 17, item 17": {
    title: "Pumping from a bowl",
    subtitle: "Hemispherical bowl r = 2 m - pump full water to the rim.",
    orientation: "horizontal",
    method: "pump-bowl",
    axisLabel: "vertical lift",
    yMin: 0,
    yMax: 2,
    bowlRadius: 2,
    bowlCenterY: 2,
    spoutHeight: 2,
    left: { t: "circle-half-y", R: 2, cy: 2, s: -1 },
    right: { t: "circle-half-y", R: 2, cy: 2, s: 1 },
    formula: [
      "r(y)=\\sqrt{4-(y-2)^2}",
      "dW=9800\\pi(4-(y-2)^2)(2-y)\\,dy",
      "W=\\int_0^2 \\rho g A(y) D(y)\\,dy"
    ],
    sampleLabel: "water height y",
    measureLabel: "lift distance"
  },
  "Briggs Ch. 6 Review Ex. 4": {
    title: "Displacement",
    subtitle: "Velocity v(t) = 20 cos(πt) — signed area gives displacement.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 1.5,
    bottom: { t: "c", v: 0 },
    top: { t: "cos", a: 20, w: 3.14159 },
    formula: ["v(t)=20\\cos(\\pi t)", "\\Delta s=\\int_0^{1.5}v(t)\\,dt"]
  },
  "Briggs Ch. 6 Review Ex. 5": {
    title: "Projectile motion",
    subtitle: "Velocity v(t) = 20 − 10t — integrate to find displacement.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 4,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -10, b: 20 },
    formula: ["v(t)=20-10t", "s(t)=\\int v(t)\\,dt", "\\Delta s=\\int_0^2 v(t)\\,dt"]
  },
  "Briggs Ch. 6 Review Ex. 6": {
    title: "Deceleration",
    subtitle: "Constant deceleration v(t) = 80 − 5t — position is ∫v dt.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 4,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -5, b: 80 },
    formula: ["v(t)=80-5t", "s(t)=80t-\\frac{5}{2}t^2", "s(4)=280"]
  }
};

/** Source keys reused across problems need distinct specs. */
export const VISUAL_BY_KEY = {
  "centroid-triangle-x": {
    title: "Centroid",
    subtitle: "Right triangle with vertices (0,0), (0,6), and (9,0). Find x̄.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 9,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -6 / 9, b: 6 },
    marker: { x: 3, y: 2 }
  },
  "centroid-triangle-y": {
    title: "Centroid",
    subtitle: "Right triangle with vertices (0,0), (0,6), and (9,0). Find ȳ.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 9,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -6 / 9, b: 6 },
    marker: { x: 3, y: 2 }
  },
  "centroid-rectangle-x": {
    title: "Centroid",
    subtitle: "Uniform rectangle 8 × 4 — centroid at the center.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 8,
    bottom: { t: "c", v: 0 },
    top: { t: "c", v: 4 },
    marker: { x: 4, y: 2 }
  },
  "centroid-triangle-slope": {
    title: "Centroid",
    subtitle: "Triangle under y = 4x from x = 0 to x = 2.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 2,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 4 },
    marker: { x: 4 / 3, y: 8 / 3 }
  },
  "area-2x-0-3": {
    title: "Area",
    subtitle: "Area under y = 2x from x = 0 to x = 3.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 3,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: 2 }
  },
  "inertia-rect-6x4-x": {
    title: "Moment of inertia",
    subtitle: "Rectangle base 6, height 4 — distance squared from x-axis.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 6,
    bottom: { t: "c", v: 0 },
    top: { t: "c", v: 4 },
    marker: { x: 3, y: 2 }
  },
  "inertia-rect-8x3-y": {
    title: "Moment of inertia",
    subtitle: "Rectangle base 8, height 3 — distance squared from y-axis.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 8,
    bottom: { t: "c", v: 0 },
    top: { t: "c", v: 3 },
    marker: { x: 4, y: 1.5 }
  },
  "inertia-rod": {
    title: "Mass of a rod",
    subtitle: "Thin rod of length 6 m with constant density 2 kg/m.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 6,
    bottom: { t: "c", v: 0 },
    top: { t: "c", v: 2 }
  },

  "vol-y-eq-1-sqrt": {
    title: "Volume (off-axis)",
    subtitle: "Region under y = 1 + √x revolved about y = 1 — radius is √x.",
    orientation: "vertical",
    method: "disk-x",
    axisLabel: "y = 1",
    axisY: 1,
    xMin: 0,
    xMax: 4,
    bottom: { t: "c", v: 1 },
    top: { t: "sqrt", a: 1, b: 1 },
    formula: ["R=\\sqrt{x}", "dV=\\pi(\\sqrt{x})^2\\,dx", "V=8\\pi"]
  },
  "vol-y-eq-2-sqrt": {
    title: "Volume (off-axis)",
    subtitle: "Region between y = √x + 1 and y = 2 revolved about y = 2.",
    orientation: "vertical",
    method: "disk-x",
    axisLabel: "y = 2",
    axisY: 2,
    xMin: 0,
    xMax: 1,
    bottom: { t: "sqrt", a: 1, b: 1 },
    top: { t: "c", v: 2 },
    formula: ["R=1-\\sqrt{x}", "dV=\\pi(1-\\sqrt{x})^2\\,dx", "V=\\frac{\\pi}{6}"]
  },
  "vol-y-eq-2-sqrt-region": {
    title: "Volume (off-axis)",
    subtitle: "Region bounded by y = 2 − √x, y = 2, x = 4 about y = 2.",
    orientation: "horizontal",
    method: "shell-x",
    axisLabel: "y = 2",
    axisY: 2,
    yMin: 0,
    yMax: 2,
    left: { t: "poly", k: [4, -4, 1] },
    right: { t: "c", v: 4 },
    formula: ["r=2-y", "h=4-(2-y)^2", "dV=2\\pi(2-y)(4-(2-y)^2)\\,dy"]
  },
  "vol-x-eq-4-sqrt": {
    title: "Volume (off-axis)",
    subtitle: "Region under y = 1 + √x revolved about x = 4.",
    orientation: "horizontal",
    method: "disk-y",
    axisLabel: "x = 4",
    axisX: 4,
    yMin: 1,
    yMax: 3,
    left: { t: "poly", k: [1, -2, 1] },
    right: { t: "c", v: 4 },
    formula: ["R=4-(y-1)^2", "dV=\\pi(4-(y-1)^2)^2\\,dy"]
  },
  "vol-y-eq-neg1-between": {
    title: "Volume (off-axis)",
    subtitle: "Region between √x + 1 and x² + 1 revolved about y = −1.",
    orientation: "vertical",
    method: "washer-x",
    axisLabel: "y = -1",
    axisY: -1,
    xMin: 0,
    xMax: 1,
    bottom: { t: "poly", k: [1, 0, 1] },
    top: { t: "sqrt", a: 1, b: 1 },
    formula: ["R=\\sqrt{x}+2", "r=x^2+2", "dV=\\pi[(\\sqrt{x}+2)^2-(x^2+2)^2]\\,dx"]
  },
  "vol-x-eq-2-between": {
    title: "Volume (off-axis)",
    subtitle: "Region between √x + 1 and x² + 1 revolved about x = 2.",
    orientation: "horizontal",
    method: "washer-y",
    axisLabel: "x = 2",
    axisX: 2,
    yMin: 1,
    yMax: 2,
    left: { t: "poly", k: [1, -2, 1] },
    right: { t: "sqrt-shift", a: 1, s: 1 },
    formula: ["R=2-(y-1)^2", "r=2-\\sqrt{y-1}", "dV=\\pi[R^2-r^2]\\,dy"]
  },
  "vol-x-eq-neg-half-sqrt": {
    title: "Volume (off-axis)",
    subtitle: "Region bounded by y = √x, y = 1, and the y-axis about x = −½.",
    orientation: "vertical",
    method: "shell-y",
    axisLabel: "x = -\\frac{1}{2}",
    axisX: -0.5,
    xMin: 0,
    xMax: 1,
    bottom: { t: "sqrt", a: 1 },
    top: { t: "c", v: 1 },
    formula: ["r=x+\\frac{1}{2}", "h=1-\\sqrt{x}", "dV=2\\pi(x+\\frac{1}{2})(1-\\sqrt{x})\\,dx"]
  },
  "vol-x-eq-4-sqrt-region": {
    title: "Volume (off-axis)",
    subtitle: "Region bounded by y = 2 − √x, y = 2, x = 4 about x = 4.",
    orientation: "vertical",
    method: "shell-y",
    axisLabel: "x = 4",
    axisX: 4,
    xMin: 0,
    xMax: 4,
    bottom: { t: "sqrt", a: -1, b: 2 },
    top: { t: "c", v: 2 },
    formula: ["r=4-x", "h=2-\\sqrt{x}", "dV=2\\pi(4-x)(2-\\sqrt{x})\\,dx"]
  },
  "vol-y-eq-1-one-minus-sqrt": {
    title: "Volume (off-axis)",
    subtitle: "Region bounded by y = 1 − √x, y = 1, x = 1 about y = 1.",
    orientation: "vertical",
    method: "disk-x",
    axisLabel: "y = 1",
    axisY: 1,
    xMin: 0,
    xMax: 1,
    bottom: { t: "sqrt", a: -1, b: 1 },
    top: { t: "c", v: 1 },
    formula: ["R=\\sqrt{x}", "dV=\\pi x\\,dx", "V=\\frac{\\pi}{2}"]
  },

  "surf-yaxis-parabola": {
    title: "Surface area (y-axis)",
    subtitle: "y = x²/4 on [2, 4] rotated about the y-axis.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 1,
    yMax: 4,
    left: { t: "c", v: 0 },
    right: { t: "sqrt", a: 2 },
    formula: ["x=2\\sqrt{y}", "S=\\frac{8\\pi}{3}(5\\sqrt{5}-2\\sqrt{2})"]
  },
  "surf-yaxis-linear": {
    title: "Surface area (y-axis)",
    subtitle: "y = 4x − 1 on [1, 4] rotated about the y-axis.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 3,
    yMax: 15,
    left: { t: "c", v: 0 },
    right: { t: "lin", a: 0.25, b: 0.25 },
    formula: ["x=\\frac{y+1}{4}", "S=15\\pi\\sqrt{17}"]
  },
  "surf-yaxis-cube-root": {
    title: "Surface area (y-axis)",
    subtitle: "y = ∛(3x) rotated about the y-axis — invert to x = y³/3.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 0,
    yMax: 2,
    left: { t: "c", v: 0 },
    right: { t: "pow", a: 1 / 3, n: 3 },
    formula: ["x=\\frac{y^3}{3}", "dS=2\\pi\\frac{y^3}{3}\\sqrt{1+y^4}\\,dy"]
  },
  "surf-yaxis-exp": {
    title: "Surface area (y-axis)",
    subtitle: "y = eˣ on [0, 1] rotated about the y-axis via x = ln y.",
    orientation: "horizontal",
    method: "surface-y",
    axisLabel: "x = 0",
    axisX: 0,
    yMin: 1,
    yMax: 2.718281828459045,
    left: { t: "c", v: 0 },
    right: { t: "log", a: 1 },
    formula: ["x=\\ln y", "dS=2\\pi(\\ln y)\\sqrt{1+\\frac{1}{y^2}}\\,dy"]
  },

  "spring-compress-0.5": {
    title: "Spring compression",
    subtitle: "Compress the spring from x = 0 to x = −0.5 — work on the negative interval.",
    orientation: "vertical",
    method: "area",
    xMin: -0.5,
    xMax: 0,
    bottom: { t: "lin", a: 100 },
    top: { t: "c", v: 0 },
    formula: ["F(x)=100x", "W=\\int_{-0.5}^0 100x\\,dx=12.5"]
  },
  "pump-cylinder-10x5": {
    title: "Pumping water",
    subtitle: "Full cylinder r = 5, h = 10 — each layer lifted to the 15 m outlet.",
    orientation: "vertical",
    method: "area",
    xMin: 0,
    xMax: 10,
    bottom: { t: "c", v: 0 },
    top: { t: "lin", a: -1, b: 15 },
    formula: ["A(y)=25\\pi", "D(y)=15-y", "W=25\\pi\\rho g\\int_0^{10}(15-y)\\,dy"]
  },
  "pump-hemi-bowl": {
    title: "Pumping from a bowl",
    subtitle: "Hemispherical bowl r = 3 m — lift water slices to the spout.",
    orientation: "horizontal",
    method: "pump-bowl",
    axisLabel: "vertical lift",
    yMin: 0,
    yMax: 2,
    left: { t: "circle-half-y", R: 3, cy: 3, s: -1 },
    right: { t: "circle-half-y", R: 3, cy: 3, s: 1 },
    formula: [
      "r(y)=\\sqrt{9-(y-3)^2}",
      "dW=1000(9.8)\\pi(9-(y-3)^2)(8-y)\\,dy",
      "W=\\int_0^2 \\rho g A(y) D(y)\\,dy"
    ],
    sampleLabel: "water height y",
    measureLabel: "lift distance"
  }
};

function inferVisualSpec(problem) {
  const params = problem.visualParams;
  if (!params) return null;
  // Prefer topic-specific strip methods so the visualizer uses the right narration
  // (Region → Strip → Moment → Balance) even when an older bank stored method: "area".
  let method = params.method || problem.visual || "area";
  if (problem.visual === "centroid" && (method === "area" || !params.method)) {
    method = "centroid";
  }
  if (problem.visual === "inertia" && (method === "area" || !params.method)) {
    method = "inertia";
  }
  const sampleDefault =
    method === "centroid" || method === "inertia" || method === "area"
      ? "sample x"
      : params.sampleLabel;
  const measureDefault =
    method === "centroid" || method === "inertia" || method === "area"
      ? "strip height"
      : params.measureLabel;
  return {
    title: problem.title || "Problem",
    subtitle: problem.insight || "",
    orientation: params.orientation || "vertical",
    method,
    formula: params.formula || [],
    sampleLabel: params.sampleLabel || sampleDefault,
    measureLabel: params.measureLabel || measureDefault,
    axisLabel: params.axisLabel,
    axisX: params.axisX,
    axisY: params.axisY,
    xMin: params.xMin,
    xMax: params.xMax,
    yMin: params.yMin,
    yMax: params.yMax,
    bottom: params.bottom,
    top: params.top,
    left: params.left,
    right: params.right,
    marker: params.marker,
    cutout: params.cutout,
    parts: params.parts,
    alternateSpec: params.alternateSpec
  };
}

function isGenericLineFallback(top) {
  return top?.t === "lin" && Math.abs((top.a ?? 0) - 1) < 1e-9 && Math.abs(top.b ?? 0) < 1e-9;
}

function applyAreaCurve(spec, top, opts = {}) {
  spec.method = spec.method || "area";
  spec.orientation = "vertical";
  spec.bottom = { t: "c", v: 0 };
  spec.top = top;
  if (opts.xMin != null) spec.xMin = opts.xMin;
  if (opts.xMax != null) spec.xMax = opts.xMax;
  if (opts.title) spec.title = opts.title;
  if (opts.subtitle) spec.subtitle = opts.subtitle;
  if (opts.formula) spec.formula = opts.formula;
  if (!spec.sampleLabel) spec.sampleLabel = "sample x";
  if (!spec.measureLabel || /shell|disk|radius|washer/i.test(spec.measureLabel)) {
    spec.measureLabel = "strip height f(x)";
  }
}

function repairGeneratedVisualSpec(problem) {
  const prompt = String(problem.prompt || "");
  const spec = problem.visualSpec;
  if (!spec) return;

  // Always use area language metrics for area-method problems (even when curves already match).
  if (spec.method === "area" || problem.visual === "area") {
    if (!spec.sampleLabel) spec.sampleLabel = "sample x";
    if (!spec.measureLabel || /shell|disk|radius|washer/i.test(String(spec.measureLabel))) {
      spec.measureLabel = "strip height f(x)";
    }
  }

  let match = prompt.match(/\\frac\{([0-9.]+)\}\{\\sqrt\{1\s*-\s*x\^\{?2\}?\}\}/);
  if (match) {
    applyAreaCurve(spec, { t: "inv-sqrt-unit", a: Number(match[1]) }, {
      title: "Inverse-trig rate",
      subtitle: `Area under ${match[1]}/sqrt(1 - x^2), restricted to the real domain.`,
      xMin: 0,
      xMax: 0.95,
      formula: [`f(x)=\\frac{${match[1]}}{\\sqrt{1-x^2}}`]
    });
    return;
  }

  // a / sqrt(R^2 - x^2)  e.g. 3/sqrt(4 - x^2)
  match = prompt.match(/\\frac\{([0-9.]+)\}\{\\sqrt\{([0-9.]+)\s*-\s*x\^\{?2\}?\}\}/);
  if (match) {
    const a = Number(match[1]);
    const R2 = Number(match[2]);
    const R = Math.sqrt(R2);
    applyAreaCurve(spec, { t: "inv-sqrt", a, R, h: 0 }, {
      title: "Inverse-trig rate",
      subtitle: `Area under ${a}/sqrt(${R2} - x^2) on a real subinterval.`,
      xMin: 0,
      xMax: 0.92 * R,
      formula: [`f(x)=\\frac{${a}}{\\sqrt{${R2}-x^2}}`]
    });
    return;
  }

  // a / sqrt(R^2 - (x ± h)^2)
  match = prompt.match(
    /\\frac\{([0-9.]+)\}\{\\sqrt\{([0-9.]+)\s*-\s*\\left\(x\s*([+-])\s*([0-9.]+)\\right\)\^\{?2\}?\}\}/
  );
  if (match) {
    const a = Number(match[1]);
    const R = Math.sqrt(Number(match[2]));
    const h = (match[3] === "-" ? 1 : -1) * Number(match[4]);
    applyAreaCurve(spec, { t: "inv-sqrt", a, R, h }, {
      title: "Inverse-trig rate",
      subtitle: `Area under ${a}/sqrt(R^2 - (x - h)^2).`,
      xMin: h,
      xMax: h + 0.92 * R,
      formula: [`f(x)=\\frac{${a}}{\\sqrt{${match[2]}-(x${match[3]}${match[4]})^2}}`]
    });
    return;
  }

  match = prompt.match(/\\int\s*-\s*(?:(\d+(?:\.\d+)?)\s*)?\\sin\{\\left\(x\s*\\right\)\}\s*\+\s*([0-9.]+)\s*\\cos\{\\left\(x\s*\\right\)\}/);
  if (match) {
    const sinCoef = Number(match[1] || 1);
    const cosCoef = Number(match[2]);
    applyAreaCurve(spec, { t: "trig-combo", sin: -sinCoef, cos: cosCoef }, {
      title: "Trigonometric rate",
      subtitle: `Area under -${sinCoef} sin x + ${cosCoef} cos x.`,
      xMin: 0,
      xMax: Math.PI * 2,
      formula: [`f(x)=-${sinCoef}\\sin x+${cosCoef}\\cos x`]
    });
    return;
  }

  // -A csc^2 + B sec^2
  match = prompt.match(
    /\\int\s*-\s*(?:(\d+(?:\.\d+)?)\s*)?\\csc\^\{2\}\{\\left\(x\s*\\right\)\}\s*\+\s*([0-9.]+)\s*\\sec\^\{2\}\{\\left\(x\s*\\right\)\}/
  );
  if (match) {
    const cscCoef = -Number(match[1] || 1);
    const secCoef = Number(match[2]);
    applyAreaCurve(spec, { t: "trig-combo", sin: 0, cos: 0, csc2: cscCoef, sec2: secCoef }, {
      title: "Trigonometric rate",
      subtitle: `Area under ${cscCoef} csc² x + ${secCoef} sec² x.`,
      xMin: 0.35,
      xMax: 1.2,
      formula: [`f(x)=${cscCoef}\\csc^2 x+${secCoef}\\sec^2 x`]
    });
    return;
  }

  match = prompt.match(/\\int\s*e\^\{x\}\s*\+\s*\\frac\{([0-9.]+)\}\{x\}/);
  if (match) {
    const recipCoef = Number(match[1]);
    applyAreaCurve(spec, { t: "exp-plus-recip", s: 1, a: 1, r: recipCoef }, {
      title: "Exponential and reciprocal rate",
      subtitle: `Area under e^x + ${recipCoef}/x on a positive domain.`,
      xMin: 0.25,
      xMax: 2,
      formula: [`f(x)=e^x+\\frac{${recipCoef}}{x}`]
    });
    return;
  }

  // x + A e^x - B/x
  match = prompt.match(
    /\\int\s*(?:(\d+(?:\.\d+)?)\s*)?x\s*\+\s*([0-9.]+)\s*e\^\{x\}\s*-\s*\\frac\{([0-9.]+)\}\{x\}/
  );
  if (match) {
    const lin = Number(match[1] || 1);
    const s = Number(match[2]);
    const r = -Number(match[3]);
    applyAreaCurve(spec, { t: "exp-lin-recip", lin, s, a: 1, r }, {
      title: "Exponential and logarithmic rate",
      subtitle: `Area under ${lin === 1 ? "" : lin}x + ${s}e^x ${r}/x.`,
      xMin: 0.25,
      xMax: 2,
      formula: [`f(x)=${lin}x+${s}e^x-\\frac{${match[3]}}{x}`]
    });
    return;
  }

  // A x^{p/q}  e.g. 3 x^{2/3}
  match = prompt.match(/\\int\s*([0-9.]+)\s*x\^\{?\\frac\{([0-9.]+)\}\{([0-9.]+)\}\}?/);
  if (match) {
    const a = Number(match[1]);
    const n = Number(match[2]) / Number(match[3]);
    applyAreaCurve(spec, { t: "pow", a, n }, {
      title: "Power-rule rate",
      subtitle: `Area under ${a} x^{${match[2]}/${match[3]}}.`,
      xMin: 0,
      xMax: 2,
      formula: [`f(x)=${a}x^{${match[2]}/${match[3]}}`]
    });
    return;
  }

  // (A x + B)(poly)^p  e.g. (2x+1)(x^2+x+3)^4
  match = prompt.match(
    /\\int\s*\\left\(([0-9.]+)\s*x\s*\+\s*([0-9.]+)\\right\)\s*\\left\(([^)]+)\\right\)\^\{?([0-9.]+)\}?/
  );
  if (match) {
    const a = Number(match[1]);
    const d = Number(match[2]);
    const p = Number(match[4]);
    // Parse simple poly like x^{2} + x + 3
    const polyStr = match[3];
    const k = [0, 0, 0, 0, 0];
    const constM = polyStr.match(/(?:^|[+\-])\s*([0-9.]+)(?!\s*x)/);
    // crude: handle x^2 + x + c pattern
    let k0 = 0, k1 = 0, k2 = 0;
    const cMatch = polyStr.match(/([0-9.]+)\s*$/);
    if (cMatch) k0 = Number(cMatch[1]);
    if (/x\^\{?2\}?/.test(polyStr)) k2 = 1;
    if (/(?:^|[+\-])\s*x(?!\^)/.test(polyStr) || /\+\s*x(?:\s|$)/.test(polyStr)) k1 = 1;
    // Keep the plotted curve camera-friendly (grows like (ax+d)(poly)^p).
    let xMax = 1.2;
    for (let x = 1.2; x >= 0.2; x -= 0.05) {
      const poly = k0 + k1 * x + k2 * x * x;
      const y = (a * x + d) * poly ** p;
      if (Number.isFinite(y) && Math.abs(y) <= 48) {
        xMax = Math.round(x * 100) / 100;
        break;
      }
      xMax = Math.round(x * 100) / 100;
    }
    applyAreaCurve(spec, { t: "sub-u-linear", a, d, k: [k0, k1, k2], p }, {
      title: "Substitution pattern",
      subtitle: `Area under (${a}x+${d})(…)^${p}.`,
      xMin: 0,
      xMax,
      formula: [`f(x)=(${a}x+${d})(\\cdots)^{${p}}`]
    });
    return;
  }

  // A x^{n-1} (x^n + c)^p  e.g. 3 x^2 (x^3 + 2)^3
  match = prompt.match(
    /\\int\s*([0-9.]+)\s*x\^\{?([0-9.]+)\}?\s*\\left\(x\^\{?([0-9.]+)\}?\s*\+\s*([0-9.]+)\\right\)\^\{?([0-9.]+)\}?/
  );
  if (match) {
    const a = Number(match[1]);
    const n = Number(match[3]);
    const c = Number(match[4]);
    const p = Number(match[5]);
    let xMax = 1.2;
    for (let x = 1.2; x >= 0.15; x -= 0.05) {
      const y = a * x ** Math.max(0, n - 1) * (x ** n + c) ** p;
      if (Number.isFinite(y) && Math.abs(y) <= 48) {
        xMax = Math.round(x * 100) / 100;
        break;
      }
      xMax = Math.round(x * 100) / 100;
    }
    applyAreaCurve(spec, { t: "sub-u-gen", a, b: 1, c, n, p }, {
      title: "Substitution pattern",
      subtitle: `Area under ${a}x^{${match[2]}}(x^{${n}}+${c})^{${p}}.`,
      xMin: 0,
      xMax,
      formula: [`f(x)=${a}x^{${match[2]}}(x^{${n}}+${c})^{${p}}`]
    });
    return;
  }

  // A x + sin x  (or 2x + sin x) — often on [0, π/2]
  match = prompt.match(
    /(?:([0-9.]+)\s*)?x\s*\+\s*\\sin\{\\left\(x\s*\\right\)\}/
  );
  if (match && /\\int/.test(prompt) && (isGenericLineFallback(spec.top) || spec.top?.t === "lin")) {
    const lin = Number(match[1] || 1);
    const xMax = /\\frac\{\\pi\}\{2\}/.test(prompt) ? Math.PI / 2 : (spec.xMax ?? Math.PI / 2);
    applyAreaCurve(spec, { t: "lin-sin", a: lin, b: 1, c: 0 }, {
      title: "Fundamental Theorem rate",
      subtitle: `Area under ${lin === 1 ? "" : lin}x + sin x.`,
      xMin: spec.xMin ?? 0,
      xMax,
      formula: [`f(x)=${lin}x+\\sin x`]
    });
    return;
  }

  // 1 - A cos x
  match = prompt.match(/\\int\s*([0-9.]+)\s*-\s*([0-9.]+)\s*\\cos\{\\left\(x\s*\\right\)\}/);
  if (match) {
    applyAreaCurve(spec, { t: "cos", a: -Number(match[2]), b: Number(match[1]) }, {
      title: "Trigonometric rate",
      subtitle: `Area under ${match[1]} - ${match[2]} cos x.`,
      xMin: 0,
      xMax: Math.PI * 2,
      formula: [`f(x)=${match[1]}-${match[2]}\\cos x`]
    });
    return;
  }

  // A / (B x^2 + C)  e.g. 6/(4x^2+9)
  match = prompt.match(/\\frac\{([0-9.]+)\}\{(?:([0-9.]+)\s*)?x\^\{?2\}?\s*\+\s*([0-9.]+)\}/);
  if (match && !/\\sqrt/.test(prompt)) {
    const a = Number(match[1]);
    const b = Number(match[2] || 1);
    const c = Number(match[3]);
    applyAreaCurve(spec, { t: "recip-quad", a, b, c }, {
      title: "Arctangent rate",
      subtitle: `Area under ${a}/(${b === 1 ? "" : b}x^2 + ${c}).`,
      xMin: 0,
      xMax: 2,
      formula: [`f(x)=\\frac{${a}}{${b === 1 ? "" : b}x^2+${c}}`]
    });
    return;
  }

  // Rational (poly)/(poly) after sympy latex, e.g. (x^3+x+1)/(x^2+1)
  match = prompt.match(
    /\\frac\{x\^\{?3\}?\s*\+\s*x\s*\+\s*1\}\{x\^\{?2\}?\s*\+\s*1\}/
  );
  if (match) {
    applyAreaCurve(spec, { t: "rat", num: [1, 1, 0, 1], den: [1, 0, 1] }, {
      title: "Fundamental Theorem evaluation",
      subtitle: "Signed area under (x³ + x + 1)/(x² + 1) = x + 1/(x² + 1) on [0, 1].",
      xMin: 0,
      xMax: 1,
      formula: [
        "f(x)=\\frac{x^3+x+1}{x^2+1}",
        "f(x)=x+\\frac{1}{x^2+1}"
      ]
    });
    return;
  }

  // Generic rational with poly num/den of modest degree — try to keep area method honest
  match = prompt.match(/\\frac\{([^{}]+)\}\{([^{}]+)\}/);
  if (match && isGenericLineFallback(spec.top) && /\\int/.test(prompt)) {
    // Fall through to other repairs; if still generic later we leave samples to bank rebuild
  }

  // F'(t) = -A t + e^t
  match = prompt.match(/F'\(t\)=-\s*([0-9.]+)\s*t\s*\+\s*e\^\{t\}/);
  if (match) {
    applyAreaCurve(spec, { t: "exp-lin-recip", lin: -Number(match[1]), s: 1, a: 1, r: 0 }, {
      title: "Initial-value rate",
      subtitle: `Integrand F'(t) = -${match[1]}t + e^t.`,
      xMin: 0,
      xMax: 2,
      formula: [`f(t)=-${match[1]}t+e^t`]
    });
    return;
  }

  // a(t) = sin(t) + 1
  match = prompt.match(/a\(t\)=\\sin\{\\left\(t\s*\\right\)\}\s*\+\s*([0-9.]+)/);
  if (match) {
    applyAreaCurve(spec, { t: "sin", a: 1, b: Number(match[1]) }, {
      title: "Motion rate",
      subtitle: `Acceleration a(t) = sin t + ${match[1]}.`,
      xMin: 0,
      xMax: Math.PI * 2,
      formula: [`a(t)=\\sin t+${match[1]}`]
    });
    return;
  }

  // x^4 + A / x^{2/3}
  match = prompt.match(/\\int\s*x\^\{?4\}?\s*\+\s*\\frac\{([0-9.]+)\}\{x\^\{?\\frac\{([0-9.]+)\}\{([0-9.]+)\}\}?\}/);
  if (match) {
    const a = Number(match[1]);
    const n = -Number(match[2]) / Number(match[3]);
    const xs = [];
    const ys = [];
    for (let i = 0; i <= 32; i += 1) {
      const x = 0.05 + (1.95 * i) / 32;
      xs.push(Number(x.toFixed(5)));
      ys.push(Number((x ** 4 + a * Math.pow(x, n)).toFixed(5)));
    }
    applyAreaCurve(spec, { t: "samples", xs, ys }, {
      title: "Power-rule rate",
      subtitle: `Area under x^4 + ${a}/x^{${match[2]}/${match[3]}}.`,
      xMin: 0.05,
      xMax: 2,
      formula: [`f(x)=x^4+\\frac{${a}}{x^{${match[2]}/${match[3]}}}`]
    });
    return;
  }

  match = prompt.match(/\\int\s*([0-9.]+)\s*x\s*\\left\(x\^\{?2\}?\s*\+\s*([0-9.]+)\\right\)\^\{?([0-9.]+)\}?/);
  if (match) {
    const factor = Number(match[1]);
    const constant = Number(match[2]);
    const power = Number(match[3]);
    // Keep the plotted integrand in a camera-friendly range (grows like x*(x^2+c)^p).
    let xMax = 1.5;
    for (let x = 1.5; x >= 0.2; x -= 0.05) {
      const y = factor * x * (x * x + constant) ** power;
      if (y <= 48) {
        xMax = Math.round(x * 100) / 100;
        break;
      }
      xMax = Math.round(x * 100) / 100;
    }
    applyAreaCurve(spec, { t: "sub-u-power", a: factor, b: 1, n: 2, c: constant, p: power }, {
      title: "Substitution pattern",
      subtitle: `Area under ${factor}x(x^2+${constant})^${power}.`,
      xMin: 0,
      xMax,
      formula: [`f(x)=${factor}x(x^2+${constant})^${power}`]
    });
    return;
  }

  // Clamp large sub-u-gen domains (3x^2(x^3+c)^p)
  if (spec.top?.t === "sub-u-gen" || spec.top?.t === "sub-u-power") {
    const top = spec.top;
    const evalY = x => {
      if (top.t === "sub-u-power") {
        return (top.a ?? 1) * x * ((top.b ?? 1) * x * x + (top.c ?? 1)) ** (top.p ?? 1);
      }
      const n = top.n ?? 2;
      return (top.a ?? 1) * x ** Math.max(0, n - 1) * ((top.b ?? 1) * x ** n + (top.c ?? 1)) ** (top.p ?? 1);
    };
    let xMax = spec.xMax ?? 2;
    for (let x = xMax; x >= 0.15; x -= 0.05) {
      const y = evalY(x);
      if (Number.isFinite(y) && Math.abs(y) <= 48) {
        xMax = Math.round(x * 100) / 100;
        break;
      }
      xMax = Math.round(x * 100) / 100;
    }
    spec.xMax = xMax;
  }

  // Catenary y = a cosh(x/a) for arc/surface banks that used {t:"cosh"} without runtime support
  match = prompt.match(/y=([0-9.]+)\\cosh\(x\/([0-9.]+)\)/);
  if (match) {
    const a = Number(match[1]);
    const scale = Number(match[2]);
    spec.top = { t: "cosh", a, scale };
    if (spec.bottom == null) spec.bottom = { t: "c", v: 0 };
    if (spec.method === "surface-x" || /revolved about the \(?x\)?-axis|about the \\\(x\\\)-axis/.test(prompt)) {
      spec.method = "surface-x";
      spec.axisY = 0;
      spec.axisLabel = "y = 0";
    }
    return;
  }

  // Signed area: if the curve is entirely below the axis on the visual domain, put
  // the curve as bottom and the axis as top so the filled region is non-empty.
  if (
    (spec.method === "area" || problem.visual === "area") &&
    spec.orientation !== "horizontal" &&
    spec.top &&
    spec.bottom?.t === "c" &&
    Math.abs(spec.bottom.v ?? 0) < 1e-12
  ) {
    const fn = compileCurve(spec.top);
    const x0 = spec.xMin ?? 0;
    const x1 = spec.xMax ?? 1;
    let pos = 0;
    let neg = 0;
    for (let i = 0; i <= 20; i += 1) {
      const x = x0 + ((x1 - x0) * i) / 20;
      const y = fn(x);
      if (!Number.isFinite(y)) continue;
      if (y > 1e-6) pos += 1;
      if (y < -1e-6) neg += 1;
    }
    if (neg > 10 && pos === 0) {
      spec.bottom = structuredClone(spec.top);
      spec.top = { t: "c", v: 0 };
      spec.subtitle = (spec.subtitle || "Signed area below the axis.") +
        (spec.subtitle ? " " : "") +
        "(curve below axis — region filled between f(x) and y = 0)";
    }
  }

  match = prompt.match(/\\frac\{([0-9.]+)\}\{(?:([0-9.]+)\s*)?x\^\{?2\}?\s*\+\s*1\}/);
  if (match) {
    const quad = Number(match[2] || 1);
    spec.title = "Arctangent rate";
    spec.subtitle = `Area under ${match[1]}/(${quad}x^2 + 1).`;
    spec.orientation = "vertical";
    spec.method = "area";
    spec.xMin = 0;
    spec.xMax = 2;
    spec.bottom = { t: "c", v: 0 };
    spec.top = { t: "recip-quad", a: Number(match[1]), b: quad, c: 1 };
    spec.formula = [`f(x)=\\frac{${match[1]}}{${quad === 1 ? "" : quad}x^2+1}`];
    return;
  }

  match = prompt.match(/Cross sections perpendicular to the \\\(x\\\)-axis are squares with side \\\(([0-9.]+)x\\\) for \\\(0\\le x\\le ([0-9.]+)\\\)/);
  if (match) {
    spec.title = "Square cross sections";
    spec.subtitle = `Each slice has square side ${match[1]}x.`;
    spec.orientation = "vertical";
    spec.method = "cross-square";
    spec.xMin = 0;
    spec.xMax = Number(match[2]);
    spec.bottom = { t: "c", v: 0 };
    spec.top = { t: "lin", a: Number(match[1]) };
    spec.formula = [`s=${match[1]}x`, "A=s^2", "dV=s^2\\,dx"];
    spec.sampleLabel = "sample x";
    spec.measureLabel = "square side";
    return;
  }

  match = prompt.match(/Cross sections perpendicular to the \\\(x\\\)-axis are semicircles with diameter \\\(([0-9.]+)x\\\) on \\\(\[0,([0-9.]+)\]\\\)/);
  if (match) {
    spec.title = "Semicircle cross sections";
    spec.subtitle = `Each slice has semicircle diameter ${match[1]}x.`;
    spec.orientation = "vertical";
    spec.method = "cross-semicircle";
    spec.xMin = 0;
    spec.xMax = Number(match[2]);
    spec.bottom = { t: "c", v: 0 };
    spec.top = { t: "lin", a: Number(match[1]) };
    spec.formula = [`d=${match[1]}x`, "A=\\frac{\\pi}{8}d^2", "dV=\\frac{\\pi}{8}d^2\\,dx"];
    spec.sampleLabel = "sample x";
    spec.measureLabel = "diameter";
    return;
  }

  // y = c + sin x  (area / centroid / inertia banks often omitted the vertical shift)
  match = prompt.match(/y=([0-9.]+)\+\\sin x/);
  if (match) {
    const c = Number(match[1]);
    spec.method = spec.method || "area";
    spec.orientation = "vertical";
    spec.xMin = spec.xMin ?? 0;
    spec.xMax = spec.xMax ?? Math.PI;
    spec.bottom = spec.bottom || { t: "c", v: 0 };
    spec.top = { t: "sin", a: 1, b: c };
    return;
  }

  // y = c + e^{-x}
  match = prompt.match(/y=([0-9.]+)\+e\^\{-x\}/);
  if (match) {
    const c = Number(match[1]);
    spec.method = spec.method || "area";
    spec.orientation = "vertical";
    spec.bottom = spec.bottom || { t: "c", v: 0 };
    spec.top = { t: "exp", s: 1, a: -1, b: c };
    return;
  }

  // Parabola y = h - x^2 vs x-axis: clamp visual domain to the arch above the axis
  match = prompt.match(/y=([0-9.]+)-x\^2/);
  if (match && spec.top?.t === "poly" && Array.isArray(spec.top.k)) {
    const h = Number(match[1]);
    const root = Math.sqrt(Math.max(0, h));
    if (spec.xMax != null && spec.xMax > root + 1e-6) {
      // Prefer the positive arch for the 3D region; keep xMin if it was negative (full enclosure).
      if ((spec.xMin ?? 0) >= 0) {
        spec.xMax = root;
        spec.subtitle = (spec.subtitle || "") + (spec.subtitle ? " " : "") +
          `(visual domain clamped to [0, √${h}] where the curve is above the x-axis)`;
      }
    }
  }

  match = prompt.match(/when \\\(y=([0-9.]+)\s*-\s*([0-9.]*)\s*x\\\) on \\\(\[0,1\]\\\) is revolved about the line \\\(y=([0-9.]+)\\\)/);
  if (match && Math.abs(Number(match[1]) - Number(match[3])) < 1e-9) {
    const intercept = Number(match[1]);
    const slope = match[2] === "" ? 1 : Number(match[2]);
    spec.title = "Surface area";
    spec.subtitle = `Rotate y = ${intercept} - ${slope}x about y = ${intercept} on [0, 1].`;
    spec.orientation = "vertical";
    spec.method = "surface-x";
    spec.axisLabel = `y = ${intercept}`;
    spec.axisY = intercept;
    spec.xMin = 0;
    spec.xMax = 1;
    spec.bottom = { t: "c", v: intercept };
    spec.top = { t: "lin", a: -slope, b: intercept };
    spec.formula = [`R=${slope}x`, `ds=\\sqrt{1+${slope * slope}}\\,dx`];
    spec.sampleLabel = "sample x";
    spec.measureLabel = "slant length";
    return;
  }

  // Volume: rotate region between y = a x (or y = x) and y = k about y = k → disks, R = k − a x
  match = prompt.match(
    /Rotate the region between \\\(y=([0-9.]*)x\\\) and \\\(y=([0-9.]+)\\\)(?:, \\\(0\\le x\\le([0-9.]+)\\\)| on \\\(\[0,([0-9.]+)\]\\\))?.*about (?:the line )?\\\(y=([0-9.]+)\\\)/
  );
  if (match) {
    const slope = match[1] === "" ? 1 : Number(match[1]);
    const topY = Number(match[2]);
    const xMax = Number(match[3] || match[4] || 1);
    const axisY = Number(match[5]);
    if (Math.abs(topY - axisY) < 1e-9) {
      const slopeLabel = slope === 1 ? "x" : `${slope}x`;
      spec.title = "Disk method about a horizontal line";
      spec.subtitle = `Region between y = ${slopeLabel} and y = ${axisY} on [0, ${xMax}], disks about y = ${axisY}. Radius R = ${axisY} − ${slopeLabel}.`;
      spec.orientation = "vertical";
      spec.method = "disk-x";
      spec.axisLabel = `y = ${axisY}`;
      spec.axisY = axisY;
      spec.xMin = 0;
      spec.xMax = xMax;
      spec.bottom = { t: "lin", a: slope };
      spec.top = { t: "c", v: axisY };
      spec.formula = [
        `R=${axisY}-${slope === 1 ? "x" : `${slope}x`}`,
        `A=\\pi R^{2}`,
        `dV=\\pi(${axisY}-${slope === 1 ? "x" : `${slope}x`})^{2}\\,dx`
      ];
      spec.sampleLabel = "sample x";
      spec.measureLabel = "disk radius";
      return;
    }
  }

  // Volume: rotate between y=√x and y=k about y=k
  match = prompt.match(
    /Rotate the region between \\\(y=\\sqrt\{x\}\\\) and \\\(y=([0-9.]+)\\\) on \\\(\[0,([0-9.]+)\]\\\) about \\\(y=([0-9.]+)\\\)/
  );
  if (match) {
    const topY = Number(match[1]);
    const xMax = Number(match[2]);
    const axisY = Number(match[3]);
    if (Math.abs(topY - axisY) < 1e-9) {
      spec.title = "Disk method about a horizontal line";
      spec.subtitle = `Region between y = √x and y = ${axisY} on [0, ${xMax}], disks about y = ${axisY}. Radius R = ${axisY} − √x.`;
      spec.orientation = "vertical";
      spec.method = "disk-x";
      spec.axisLabel = `y = ${axisY}`;
      spec.axisY = axisY;
      spec.xMin = 0;
      spec.xMax = xMax;
      spec.bottom = { t: "sqrt", a: 1 };
      spec.top = { t: "c", v: axisY };
      spec.formula = [`R=${axisY}-\\sqrt{x}`, `A=\\pi R^{2}`, `dV=\\pi(${axisY}-\\sqrt{x})^{2}\\,dx`];
      spec.sampleLabel = "sample x";
      spec.measureLabel = "disk radius";
    }
  }
}

/**
 * Attach / repair visualSpec on a problem (mutates).
 * Prefer calling materializeVisualExample from materializeVisual.js at app seams;
 * this stays the internal adapter for maps + generator compatibility repair.
 *
 * Repair is intentionally a shrinking layer: when the bank generator emits complete
 * visualParams, these regex patches should no-op. Track provenance so audits can
 * measure repair rate and drive generator completeness.
 *
 * @returns {object} problem with visualSpec and _specProvenance set
 */
export function attachVisualSpec(problem) {
  let provenance = SPEC_PROVENANCE.NONE;
  if (problem.visualKey && VISUAL_BY_KEY[problem.visualKey]) {
    problem.visualSpec = structuredClone(VISUAL_BY_KEY[problem.visualKey]);
    provenance = SPEC_PROVENANCE.MAP_KEY;
  } else if (problem.source && VISUAL_BY_SOURCE[problem.source]) {
    problem.visualSpec = structuredClone(VISUAL_BY_SOURCE[problem.source]);
    provenance = SPEC_PROVENANCE.MAP_SOURCE;
  } else if (problem.visualParams) {
    problem.visualSpec = inferVisualSpec(problem);
    provenance = SPEC_PROVENANCE.VISUAL_PARAMS;
  }

  // Compatibility only — generator-owned specs should not need this.
  // Snapshot method+domain so we only tag REPAIR when something load-bearing changes.
  const before = problem.visualSpec
    ? `${problem.visualSpec.method}|${problem.visualSpec.xMin}|${problem.visualSpec.xMax}|${JSON.stringify(problem.visualSpec.top)}`
    : "";
  repairGeneratedVisualSpec(problem);
  const after = problem.visualSpec
    ? `${problem.visualSpec.method}|${problem.visualSpec.xMin}|${problem.visualSpec.xMax}|${JSON.stringify(problem.visualSpec.top)}`
    : "";
  if (before && after && before !== after && provenance === SPEC_PROVENANCE.VISUAL_PARAMS) {
    provenance = SPEC_PROVENANCE.REPAIR;
  }

  if (problem.visualSpec) {
    if (problem.dualMethod !== false) {
      problem.dualMethod = Boolean(
        problem.dualMethod || problem.visualSpec.alternateSpec || problem.alternateSteps?.length
      );
    }
  }
  problem._specProvenance = provenance;
  return problem;
}
