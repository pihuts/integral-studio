import { VISUAL_BY_SOURCE, VISUAL_BY_KEY } from "../src/briggsVisualSpecs.js";
import { compileCurve } from "../src/visualSpecs.js";

const checks = [
  {
    key: "Briggs §6.2",
    map: VISUAL_BY_SOURCE,
    fn: x => {
      const top = compileCurve({ t: "poly", k: [2, 0, -1] })(x);
      const bot = compileCurve({ t: "lin", a: 1 })(x);
      return Math.abs(top - (2 - x * x)) < 1e-9 && Math.abs(bot - x) < 1e-9 && top >= bot;
    },
    x: 0.5,
  },
  {
    key: "centroid-triangle-x",
    map: VISUAL_BY_KEY,
    fn: x => {
      const top = compileCurve({ t: "lin", a: -6 / 9, b: 6 })(x);
      return Math.abs(top - (6 - (2 / 3) * x)) < 1e-9;
    },
    x: 4.5,
  },
  {
    key: "Briggs §6.4, Example 5",
    map: VISUAL_BY_SOURCE,
    fn: x => {
      const top = compileCurve({ t: "quad", a: 1, b: 2 })(x);
      const bot = compileCurve({ t: "lin", a: 1 })(x);
      return Math.abs(top - (2 * x - x * x)) < 1e-9 && top >= bot;
    },
    x: 0.5,
  },
  {
    key: "vol-x-eq-4-sqrt-region",
    map: VISUAL_BY_KEY,
    fn: x => {
      const bot = compileCurve({ t: "sqrt", a: -1, b: 2 })(x);
      return Math.abs(bot - (2 - Math.sqrt(x))) < 1e-9;
    },
    x: 1,
  },
  {
    key: "Briggs §5.5",
    map: VISUAL_BY_SOURCE,
    fn: x => {
      const top = compileCurve({ t: "cos2", a: 1 })(x);
      return Math.abs(top - Math.pow(Math.cos(x), 2)) < 1e-9;
    },
    x: 1,
  },
  {
    key: "Briggs §5.5, Ex. 7",
    map: VISUAL_BY_SOURCE,
    fn: x => {
      const top = compileCurve({ t: "sub-u-power", a: 2, b: 1, n: 2, c: 1, p: 4 })(x);
      return Math.abs(top - 2 * x * Math.pow(x * x + 1, 4)) < 1e-9;
    },
    x: 1,
  },
];

let failed = 0;
for (const check of checks) {
  const spec = check.map[check.key];
  if (!spec) {
    console.log(`MISSING ${check.key}`);
    failed += 1;
    continue;
  }
  if (!check.fn(check.x)) {
    console.log(`FAIL ${check.key}`);
    failed += 1;
  } else {
    console.log(`OK ${check.key}`);
  }
}
process.exit(failed ? 1 : 0);