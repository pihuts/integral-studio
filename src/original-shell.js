import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildExampleFromSpec, compileCurve } from './visualSpecs.js';



    const sceneHost = document.getElementById("scene");
    const progressInput = document.getElementById("progress");
    const playbackModeInput = document.getElementById("playbackMode");
    const speedInput = document.getElementById("speed");
    const shellCountInput = document.getElementById("shells");
    const playButton = document.getElementById("play");
    const resetButton = document.getElementById("reset");
    if (shellCountInput) {
      shellCountInput.min = "4";
      shellCountInput.max = "48";
      shellCountInput.step = "1";
      if (!shellCountInput.value) shellCountInput.value = "14";
    }
    if (speedInput) {
      speedInput.min = "0.25";
      speedInput.max = "3";
      speedInput.step = "0.05";
      if (!speedInput.value) speedInput.value = "1";
    }
    if (progressInput) {
      progressInput.min = "0";
      progressInput.max = "1";
      progressInput.step = "0.001";
    }
    const xReadout = document.getElementById("xReadout");
    const hReadout = document.getElementById("hReadout");

    const query = new URLSearchParams(window.location.search);
    const parseCanvasColor = raw => {
      const hex = String(raw || "ede6d8").replace("#", "");
      const value = Number.parseInt(hex, 16);
      return Number.isFinite(value) ? value : 0xede6d8;
    };
    const canvasColor = parseCanvasColor(query.get("canvas"));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(canvasColor, 1);
    renderer.shadowMap.enabled = false;
    sceneHost.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "3D concept diagram. Arrow keys orbit, plus and minus zoom, R resets the camera."
    );
    renderer.domElement.addEventListener("pointerdown", event => {
      if (event.button === 1) event.preventDefault();
      renderer.domElement.focus({ preventScroll: true });
    });
    renderer.domElement.addEventListener("auxclick", event => event.preventDefault());
    renderer.domElement.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "integral-studio",
          action: "error",
          message: "Graphics context was lost. Try reloading the visualization."
        }, window.location.origin);
      }
    });

    const scene = new THREE.Scene();
    // Fog is retuned per-example in applyViewLimits so tall graphs stay sharp.
    scene.fog = new THREE.Fog(canvasColor, 18, 42);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(4.8, 3.1, 5.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.45, 0);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1.2;
    controls.maxDistance = 28;
    // Left + middle mouse drag orbit the camera; wheel zooms; right pans.
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };

    const root = new THREE.Group();
    root.rotation.y = -0.42;
    scene.add(root);

    const exampleInput = document.getElementById("example");
    // Prefer query param over the HTML default (kept CSP-friendly: no inline script).
    {
      const exampleFromQuery = query.get("example");
      if (exampleFromQuery && exampleInput) {
        const allowed = new Set([...exampleInput.options].map(opt => opt.value));
        if (allowed.has(exampleFromQuery)) exampleInput.value = exampleFromQuery;
      }
    }
    const exampleTitle = document.getElementById("exampleTitle");
    const exampleSubtitle = document.getElementById("exampleSubtitle");
    const formulaPanel = document.getElementById("formula");
    const toggleFormulaButton = document.getElementById("toggleFormula");
    const sampleLabel = document.getElementById("sampleLabel");
    const measureLabel = document.getElementById("measureLabel");
    const stepRegionText = document.getElementById("stepRegionText");
    const stepSliceText = document.getElementById("stepSliceText");
    const stepRotateText = document.getElementById("stepRotateText");
    const stepStackText = document.getElementById("stepStackText");
    const legendSlice = document.getElementById("legendSlice");
    const legendSolid = document.getElementById("legendSolid");

    // Math → world scales. Defaults suit typical textbook domains (~[0,4]×[0,6]).
    // configureWorldScale() shrinks huge ranges so graphs stay navigable and unfogged.
    const DEFAULT_SCALE_X = 0.45;
    const DEFAULT_SCALE_Y = 0.3;
    const TARGET_WORLD_SPAN = 4.4;
    let scaleX = DEFAULT_SCALE_X;
    let scaleY = DEFAULT_SCALE_Y;
    const xToWorld = x => x * scaleX;
    const yToWorld = y => y * scaleY;
    const clamp01 = value => Math.min(1, Math.max(0, value));
    const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
    const compileBound = bound => {
      if (typeof bound === "function") return bound;
      if (!bound) return () => 0;
      return compileCurve(bound);
    };

    /** Keep subject sharp: fog starts beyond the fitted camera distance. */
    function applyViewLimits(fitDistance) {
      const distance = Number.isFinite(fitDistance) && fitDistance > 0 ? fitDistance : 8;
      controls.minDistance = clamp(distance * 0.22, 0.8, 6);
      controls.maxDistance = clamp(distance * 3.2, 16, 80);
      camera.near = clamp(distance * 0.02, 0.05, 0.5);
      camera.far = Math.max(100, distance * 10);
      camera.updateProjectionMatrix();
      const fogColor = scene.fog?.color ?? new THREE.Color(canvasColor);
      // near well past the camera so the diagram itself is not washed out
      const fogNear = Math.max(14, distance * 1.85);
      const fogFar = Math.max(fogNear + 12, distance * 3.6);
      scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    }

    /**
     * Map each problem's math domain into a comfortable world size.
     * Tall curves (e.g. y = x³+2x²+1 on [0,4] → ymax≈97) used to blow up to
     * ~30 world units, hit maxDistance, and sit inside the depth fog.
     */
    function configureWorldScale(ex) {
      const fixedScaleMethods = new Set(["goat-barn", "pool-fill", "pump-bowl"]);
      if (!ex || fixedScaleMethods.has(ex.method)) {
        scaleX = DEFAULT_SCALE_X;
        scaleY = DEFAULT_SCALE_Y;
        return;
      }

      // getSceneBounds uses math units only (not scaleX/scaleY).
      const bounds = getSceneBounds(ex);
      const mathSpanX = Math.max(1e-6, bounds.xMax - bounds.xMin);
      const mathSpanY = Math.max(1e-6, bounds.yMax - bounds.yMin);
      const defaultWorldX = mathSpanX * DEFAULT_SCALE_X;
      const defaultWorldY = mathSpanY * DEFAULT_SCALE_Y;

      // Keep textbook defaults when they already land in a comfortable range.
      const fitsComfortably =
        defaultWorldX <= TARGET_WORLD_SPAN * 1.2 &&
        defaultWorldY <= TARGET_WORLD_SPAN * 1.2 &&
        defaultWorldX >= 0.9 &&
        defaultWorldY >= 0.7;

      if (fitsComfortably) {
        scaleX = DEFAULT_SCALE_X;
        scaleY = DEFAULT_SCALE_Y;
        return;
      }

      // Independent axis scales: each axis targets TARGET_WORLD_SPAN when large,
      // and only grows toward the default for very small domains (avoid giant micro-graphs).
      scaleX = clamp(TARGET_WORLD_SPAN / mathSpanX, 0.02, DEFAULT_SCALE_X * 1.15);
      scaleY = clamp(TARGET_WORLD_SPAN / mathSpanY, 0.015, DEFAULT_SCALE_Y * 1.15);

      // If one axis is already small under defaults, don't crush the other further —
      // prefer readable proportions when only one dimension is extreme.
      if (defaultWorldX <= TARGET_WORLD_SPAN && defaultWorldX >= 0.9) {
        scaleX = DEFAULT_SCALE_X;
      }
      if (defaultWorldY <= TARGET_WORLD_SPAN && defaultWorldY >= 0.7) {
        scaleY = DEFAULT_SCALE_Y;
      }
    }

    function normalizeExample(example) {
      if (!example) return example;
      if (example.orientation === "vertical") {
        example.bottom = compileBound(example.bottom);
        example.top = compileBound(example.top);
      } else {
        example.left = compileBound(example.left);
        example.right = compileBound(example.right);
      }
      return example;
    }

    const examples = {
      "problem-disk-parabola": {
        title: "Problem: Disk Method",
        subtitle: "Find the volume when the region under y = 4 - x^2 from x = 0 to x = 2 is revolved about the x-axis.",
        orientation: "vertical",
        method: "disk-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => 4 - x * x,
        formula: ["R=4-x^2", "A=\\pi(4-x^2)^2", "dV=\\pi(4-x^2)^2\\,dx", "V=\\int_0^2 \\pi(4-x^2)^2\\,dx=\\frac{256\\pi}{15}"],
        sampleLabel: "sample x",
        measureLabel: "disk radius",
      },
      "problem-washer-lines": {
        title: "Problem: Washer Method",
        subtitle: "Find the volume when the region between y = 2x and y = x from x = 0 to x = 2 is revolved about the x-axis.",
        orientation: "vertical",
        method: "washer-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 2,
        bottom: x => x,
        top: x => 2 * x,
        formula: ["R=2x", "r=x", "dV=\\pi\\big((2x)^2-x^2\\big)\\,dx", "V=\\int_0^2 \\pi(3x^2)\\,dx=8\\pi"],
        sampleLabel: "sample x",
        measureLabel: "outer radius",
      },
      "problem-shell-parabola-y": {
        title: "Problem: Shell Method",
        subtitle: "Find the volume when the region under y = 4 - x^2 from x = 0 to x = 2 is revolved about the y-axis.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = 0",
        axisX: 0,
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => 4 - x * x,
        formula: ["r=x", "h=4-x^2", "dV=2\\pi x(4-x^2)\\,dx", "V=\\int_0^2 2\\pi x(4-x^2)\\,dx=8\\pi"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "problem-shell-line-x8": {
        title: "Problem: Shells about x = 8",
        subtitle: "Find the volume when the region under y = x + 1 from x = 0 to x = 3 is revolved about the vertical line x = 8.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = 8",
        axisX: 8,
        xMin: 0,
        xMax: 3,
        bottom: () => 0,
        top: x => x + 1,
        formula: ["r=8-x", "h=x+1", "dV=2\\pi(8-x)(x+1)\\,dx", "V=\\int_0^3 2\\pi(8-x)(x+1)\\,dx=93\\pi"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "problem-shell-linear-y": {
        title: "Problem: Shells about the y-axis",
        subtitle: "Find the volume when the region under y = 3x + 1 from x = 0 to x = 2 is revolved about the y-axis.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = 0",
        axisX: 0,
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => 3 * x + 1,
        formula: ["r=x", "h=3x+1", "dV=2\\pi x(3x+1)\\,dx", "V=2\\pi\\int_0^2 x(3x+1)\\,dx=20\\pi"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "problem-shell-sideways-x": {
        title: "Problem: Shells about the x-axis",
        subtitle: "Find the volume when the region bounded by x = 0 and x = 4 - y^2 from y = 0 to y = 2 is revolved about the x-axis.",
        orientation: "horizontal",
        method: "shell-x",
        axisLabel: "y = 0",
        axisY: 0,
        yMin: 0,
        yMax: 2,
        left: () => 0,
        right: y => 4 - y * y,
        formula: ["r=y", "h=4-y^2", "dV=2\\pi y(4-y^2)\\,dy", "V=2\\pi\\int_0^2 y(4-y^2)\\,dy=8\\pi"],
        sampleLabel: "sample y",
        measureLabel: "shell height",
      },
      "problem-shell-parabola-x5": {
        title: "Problem: Shells about x = 5",
        subtitle: "Find the volume when the region under y = 4 - x^2 from x = 0 to x = 2 is revolved about the vertical line x = 5.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = 5",
        axisX: 5,
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => 4 - x * x,
        formula: ["r=5-x", "h=4-x^2", "dV=2\\pi(5-x)(4-x^2)\\,dx", "V=2\\pi\\int_0^2(5-x)(4-x^2)\\,dx=\\frac{136\\pi}{3}"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "problem-shell-line-y6": {
        title: "Problem: Shells about y = 6",
        subtitle: "Find the volume when the region bounded by x = 0 and x = y + 1 from y = 0 to y = 3 is revolved about the horizontal line y = 6.",
        orientation: "horizontal",
        method: "shell-x",
        axisLabel: "y = 6",
        axisY: 6,
        yMin: 0,
        yMax: 3,
        left: () => 0,
        right: y => y + 1,
        formula: ["r=6-y", "h=y+1", "dV=2\\pi(6-y)(y+1)\\,dy", "V=2\\pi\\int_0^3(6-y)(y+1)\\,dy=63\\pi"],
        sampleLabel: "sample y",
        measureLabel: "shell height",
      },
      "problem-shell-quadratic-xneg2": {
        title: "Problem: Shells about x = -2",
        subtitle: "Find the volume when the region under y = x^2 + 1 from x = 0 to x = 2 is revolved about the vertical line x = -2.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = -2",
        axisX: -2,
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => x * x + 1,
        formula: ["r=x+2", "h=x^2+1", "dV=2\\pi(x+2)(x^2+1)\\,dx", "V=2\\pi\\int_0^2(x+2)(x^2+1)\\,dx=\\frac{92\\pi}{3}"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "problem-arc-parabola": {
        title: "Problem: Arc Length",
        subtitle: "Find the length of y = x^2 from x = 0 to x = 2 by adding hypotenuse segments and taking the limit.",
        orientation: "vertical",
        method: "arc",
        axisLabel: "none",
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => x * x,
        formula: ["f'(x)=2x", "ds=\\sqrt{1+(2x)^2}\\,dx", "ds=\\sqrt{1+4x^2}\\,dx", "L=\\int_0^2 \\sqrt{1+4x^2}\\,dx=\\sqrt{17}+\\frac{1}{4}\\ln(4+\\sqrt{17})"],
        sampleLabel: "sample x",
        measureLabel: "segment length",
      },
      "problem-surface-line": {
        title: "Problem: Surface Area",
        subtitle: "Find the surface area when y = x + 1 from x = 0 to x = 3 is revolved about the x-axis.",
        orientation: "vertical",
        method: "surface-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 3,
        bottom: () => 0,
        top: x => x + 1,
        formula: ["f'(x)=1", "ds=\\sqrt{1+1^2}\\,dx=\\sqrt{2}\\,dx", "dS=2\\pi(x+1)\\sqrt{2}\\,dx", "S=\\int_0^3 2\\pi(x+1)\\sqrt{2}\\,dx=15\\pi\\sqrt{2}"],
        sampleLabel: "sample x",
        measureLabel: "slant length",
      },
      "problem-arc-line": {
        title: "Problem: Arc Length of a Line",
        subtitle: "Find the arc length of y = 3x + 2 from x = 0 to x = 2.",
        orientation: "vertical",
        method: "arc",
        axisLabel: "none",
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => 3 * x + 2,
        formula: ["f'(x)=3", "ds=\\sqrt{1+3^2}\\,dx=\\sqrt{10}\\,dx", "L=\\int_0^2\\sqrt{10}\\,dx", "L=2\\sqrt{10}"],
        sampleLabel: "sample x",
        measureLabel: "segment length",
      },
      "problem-arc-radical": {
        title: "Problem: Arc Length with a Radical",
        subtitle: "Find the arc length of y = 2/3(x + 1)^(3/2) from x = 0 to x = 3.",
        orientation: "vertical",
        method: "arc",
        axisLabel: "none",
        xMin: 0,
        xMax: 3,
        bottom: () => 0,
        top: x => (2 / 3) * Math.pow(x + 1, 1.5),
        formula: ["f'(x)=\\sqrt{x+1}", "ds=\\sqrt{1+x+1}\\,dx=\\sqrt{x+2}\\,dx", "L=\\int_0^3\\sqrt{x+2}\\,dx", "L=\\frac{2}{3}\\left(5\\sqrt{5}-2\\sqrt{2}\\right)"],
        sampleLabel: "sample x",
        measureLabel: "segment length",
      },
      "problem-arc-polynomial-exact": {
        title: "Problem: Arc Length with Exact Simplification",
        subtitle: "Find the arc length of y = 1/3(x^2 + 2)^(3/2) from x = 0 to x = 2.",
        orientation: "vertical",
        method: "arc",
        axisLabel: "none",
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => Math.pow(x * x + 2, 1.5) / 3,
        formula: ["f'(x)=x\\sqrt{x^2+2}", "ds=\\sqrt{1+x^2(x^2+2)}\\,dx", "ds=(x^2+1)\\,dx", "L=\\int_0^2(x^2+1)\\,dx=\\frac{14}{3}"],
        sampleLabel: "sample x",
        measureLabel: "segment length",
      },
      "problem-surface-line-xplus2": {
        title: "Problem: Surface Area of y = x + 2",
        subtitle: "Find the surface area when y = x + 2 from x = 0 to x = 3 is revolved about the x-axis.",
        orientation: "vertical",
        method: "surface-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 3,
        bottom: () => 0,
        top: x => x + 2,
        formula: ["f'(x)=1", "ds=\\sqrt{2}\\,dx", "dS=2\\pi(x+2)\\sqrt{2}\\,dx", "S=2\\pi\\sqrt{2}\\int_0^3(x+2)\\,dx=21\\pi\\sqrt{2}"],
        sampleLabel: "sample x",
        measureLabel: "slant length",
      },
      "problem-surface-steep-line": {
        title: "Problem: Surface Area of y = 2x + 1",
        subtitle: "Find the surface area when y = 2x + 1 from x = 0 to x = 2 is revolved about the x-axis.",
        orientation: "vertical",
        method: "surface-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 2,
        bottom: () => 0,
        top: x => 2 * x + 1,
        formula: ["f'(x)=2", "ds=\\sqrt{5}\\,dx", "dS=2\\pi(2x+1)\\sqrt{5}\\,dx", "S=2\\pi\\sqrt{5}\\int_0^2(2x+1)\\,dx=12\\pi\\sqrt{5}"],
        sampleLabel: "sample x",
        measureLabel: "slant length",
      },
      "problem-pump-bowl": {
        title: "Pumping Water from a Hemispherical Bowl",
        subtitle: "A hemispherical bowl has radius 3 m, is filled to height 2 m from the ground, and water is pumped to a spout 5 m above the rim.",
        orientation: "horizontal",
        method: "pump-bowl",
        axisLabel: "vertical lift",
        yMin: 0,
        yMax: 2,
        left: y => -Math.sqrt(Math.max(0, 9 - (y - 3) * (y - 3))),
        right: y => Math.sqrt(Math.max(0, 9 - (y - 3) * (y - 3))),
        formula: [
          "r(y)=\\sqrt{9-(y-3)^2}",
          "dV=\\pi\\big(9-(y-3)^2\\big)\\,dy",
          "dW=1000(9.8)\\pi\\big(9-(y-3)^2\\big)(8-y)\\,dy",
          "W=9800\\int_0^2 \\pi\\big(9-(y-3)^2\\big)(8-y)\\,dy=\\frac{1842400\\pi}{3}\\text{ J}\\approx1.93\\times10^6\\text{ J}"
        ],
        sampleLabel: "water height y",
        measureLabel: "lift distance",
      },
      "problem-pool-fill": {
        title: "Filling an Uneven Swimming Pool",
        subtitle: "The pool is 20 m long and 8 m wide. Its depth increases linearly from 1 m to 3 m, and water flows in at 0.5 m^3/s.",
        orientation: "vertical",
        method: "pool-fill",
        axisLabel: "pool length",
        xMin: 0,
        xMax: 20,
        bottom: () => 0,
        top: x => 1 + x / 10,
        formula: [
          "d(x)=1+\\frac{x}{10}",
          "dV=8\\left(1+\\frac{x}{10}\\right)\\,dx",
          "V=\\int_0^{20}8\\left(1+\\frac{x}{10}\\right)\\,dx=320\\text{ m}^3",
          "t=\\frac{320}{0.5}=640\\text{ s}=10\\text{ min }40\\text{ s}"
        ],
        sampleLabel: "position x",
        measureLabel: "volume / time",
      },
      "problem-goat-barn": {
        title: "Area Grazed by a Leashed Goat",
        subtitle: "A goat is tied to a barn corner with a 10 m leash. The barn is 6 m by 4 m, and the leash can wrap around the barn corners.",
        orientation: "geometry",
        method: "goat-barn",
        yMin: 0,
        yMax: 3,
        formula: [
          "A_1=\\frac{3}{4}\\pi(10)^2",
          "A_2=\\frac{1}{4}\\pi(10-6)^2",
          "A_3=\\frac{1}{4}\\pi(10-4)^2",
          "A=75\\pi+4\\pi+9\\pi=88\\pi\\text{ m}^2"
        ],
        sampleLabel: "leash stage",
        measureLabel: "area total",
      },
      "shell-y": {
        title: "Shells about y-axis",
        subtitle: "Vertical strips rotate around the y-axis. Each strip has radius x, height f(x), and thickness dx.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = 0",
        axisX: 0,
        xMin: 0,
        xMax: 4,
        bottom: () => 0,
        top: x => 0.85 + 0.22 * Math.sin(1.6 * x) + 0.18 * x,
        formula: ["r=x", "h=f(x)", "dV=2\\pi x f(x)\\,dx", "V=\\int_a^b 2\\pi x f(x)\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "shell-x8": {
        title: "Shells about x = 8",
        subtitle: "Vertical strips rotate around the line x = 8. The radius is the horizontal distance from the strip to that line.",
        orientation: "vertical",
        method: "shell-y",
        axisLabel: "x = 8",
        axisX: 8,
        xMin: 0,
        xMax: 4,
        bottom: () => 0,
        top: x => 0.85 + 0.22 * Math.sin(1.6 * x) + 0.18 * x,
        formula: ["r=8-x", "h=f(x)", "dV=2\\pi(8-x)f(x)\\,dx", "V=\\int_a^b 2\\pi(8-x)f(x)\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "shell height",
      },
      "shell-x": {
        title: "Shells about x-axis",
        subtitle: "Horizontal strips rotate around the x-axis. Each strip has radius y and height measured left-to-right.",
        orientation: "horizontal",
        method: "shell-x",
        axisLabel: "y = 0",
        axisY: 0,
        yMin: 0,
        yMax: 2.4,
        left: () => 0,
        right: y => 3.9 - 0.52 * y + 0.15 * Math.sin(2.2 * y),
        formula: ["r=y", "h=g(y)", "dV=2\\pi y g(y)\\,dy", "V=\\int_c^d 2\\pi y g(y)\\,dy"],
        sampleLabel: "sample y",
        measureLabel: "shell height",
      },
      "shell-y8": {
        title: "Shells about y = 8",
        subtitle: "Horizontal strips rotate around the line y = 8. The radius is the vertical distance from the strip to that line.",
        orientation: "horizontal",
        method: "shell-x",
        axisLabel: "y = 8",
        axisY: 8,
        yMin: 0,
        yMax: 2.4,
        left: () => 0,
        right: y => 3.9 - 0.52 * y + 0.15 * Math.sin(2.2 * y),
        formula: ["r=8-y", "h=g(y)", "dV=2\\pi(8-y)g(y)\\,dy", "V=\\int_c^d 2\\pi(8-y)g(y)\\,dy"],
        sampleLabel: "sample y",
        measureLabel: "shell height",
      },
      "disk-x": {
        title: "Disks about x-axis",
        subtitle: "Vertical slices rotate around the x-axis. Since the region touches the axis, each slice becomes a solid disk.",
        orientation: "vertical",
        method: "disk-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 4,
        bottom: () => 0,
        top: x => 0.95 + 0.25 * Math.sin(1.35 * x) + 0.11 * x,
        formula: ["R=f(x)", "A=\\pi[f(x)]^2", "dV=\\pi[f(x)]^2\\,dx", "V=\\int_a^b \\pi[f(x)]^2\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "disk radius",
      },
      "disk-y": {
        title: "Disks about y-axis",
        subtitle: "Horizontal slices rotate around the y-axis. Since the region touches the axis, each slice becomes a solid disk.",
        orientation: "horizontal",
        method: "disk-y",
        axisLabel: "x = 0",
        axisX: 0,
        yMin: 0,
        yMax: 3,
        left: () => 0,
        right: y => 1.05 + 0.46 * y + 0.16 * Math.sin(2 * y),
        formula: ["R=g(y)", "A=\\pi[g(y)]^2", "dV=\\pi[g(y)]^2\\,dy", "V=\\int_c^d \\pi[g(y)]^2\\,dy"],
        sampleLabel: "sample y",
        measureLabel: "disk radius",
      },
      "disk-y8": {
        title: "Disks about y = 8",
        subtitle: "Vertical slices from the curve up to y = 8 rotate around y = 8, so each slice becomes a disk with radius 8 - f(x).",
        orientation: "vertical",
        method: "disk-x",
        axisLabel: "y = 8",
        axisY: 8,
        xMin: 0,
        xMax: 4,
        bottom: x => 0.95 + 0.25 * Math.sin(1.35 * x) + 0.11 * x,
        top: () => 8,
        formula: ["R=8-f(x)", "A=\\pi(8-f(x))^2", "dV=\\pi(8-f(x))^2\\,dx", "V=\\int_a^b \\pi(8-f(x))^2\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "disk radius",
      },
      "washer-x": {
        title: "Washers about x-axis",
        subtitle: "Vertical slices between two curves rotate around the x-axis. The hole comes from the inner radius.",
        orientation: "vertical",
        method: "washer-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 4,
        bottom: x => 0.38 + 0.06 * Math.sin(1.7 * x),
        top: x => 1.2 + 0.22 * Math.sin(1.25 * x) + 0.12 * x,
        formula: ["R=f(x)", "r=g(x)", "dV=\\pi\\big([f(x)]^2-[g(x)]^2\\big)\\,dx", "V=\\int_a^b \\pi(R^2-r^2)\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "outer radius",
      },
      "washer-y": {
        title: "Washers about y-axis",
        subtitle: "Horizontal slices between left and right curves rotate around the y-axis to make washers.",
        orientation: "horizontal",
        method: "washer-y",
        axisLabel: "x = 0",
        axisX: 0,
        yMin: 0,
        yMax: 3,
        left: y => 0.42 + 0.06 * Math.sin(2 * y),
        right: y => 1.25 + 0.42 * y + 0.12 * Math.sin(2.5 * y),
        formula: ["R=x_{\\text{right}}(y)", "r=x_{\\text{left}}(y)", "dV=\\pi(R^2-r^2)\\,dy", "V=\\int_c^d \\pi(R^2-r^2)\\,dy"],
        sampleLabel: "sample y",
        measureLabel: "outer radius",
      },
      "washer-y8": {
        title: "Washers about y = 8",
        subtitle: "Vertical slices rotate around the horizontal line y = 8. The outer radius reaches the lower curve; the inner radius reaches the upper curve.",
        orientation: "vertical",
        method: "washer-x",
        axisLabel: "y = 8",
        axisY: 8,
        xMin: 0,
        xMax: 4,
        bottom: x => 0.45 + 0.06 * Math.sin(1.7 * x),
        top: x => 1.35 + 0.24 * Math.sin(1.1 * x) + 0.1 * x,
        formula: ["R=8-g(x)", "r=8-f(x)", "dV=\\pi\\big((8-g(x))^2-(8-f(x))^2\\big)\\,dx", "V=\\int_a^b \\pi(R^2-r^2)\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "outer radius",
      },
      "washer-x8": {
        title: "Washers about x = 8",
        subtitle: "Horizontal slices rotate around the vertical line x = 8. The outer radius reaches the left curve; the inner radius reaches the right curve.",
        orientation: "horizontal",
        method: "washer-y",
        axisLabel: "x = 8",
        axisX: 8,
        yMin: 0,
        yMax: 3,
        left: y => 0.42 + 0.06 * Math.sin(2 * y),
        right: y => 1.25 + 0.42 * y + 0.12 * Math.sin(2.5 * y),
        formula: ["R=8-x_{\\text{left}}(y)", "r=8-x_{\\text{right}}(y)", "dV=\\pi\\big((8-x_{\\text{left}})^2-(8-x_{\\text{right}})^2\\big)\\,dy", "V=\\int_c^d \\pi(R^2-r^2)\\,dy"],
        sampleLabel: "sample y",
        measureLabel: "outer radius",
      },
      "arc-length": {
        title: "Arc Length",
        subtitle: "Mark points on a curve, connect consecutive points with straight hypotenuse segments, then refine the partition.",
        orientation: "vertical",
        method: "arc",
        axisLabel: "none",
        xMin: 0,
        xMax: 4,
        bottom: () => 0,
        top: x => 0.75 + 0.22 * x + 0.34 * Math.sin(1.25 * x),
        formula: ["\\Delta s=\\sqrt{(\\Delta x)^2+(\\Delta y)^2}", "L\\approx\\sum\\sqrt{(\\Delta x)^2+(\\Delta y)^2}", "ds=\\sqrt{1+[f'(x)]^2}\\,dx", "L=\\int_a^b\\sqrt{1+[f'(x)]^2}\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "segment length",
      },
      "surface-x": {
        title: "Surface Area about x-axis",
        subtitle: "A short arc segment rotates into a frustum band. Its area is approximately circumference times slant length.",
        orientation: "vertical",
        method: "surface-x",
        axisLabel: "y = 0",
        axisY: 0,
        xMin: 0,
        xMax: 4,
        bottom: () => 0,
        top: x => 0.82 + 0.18 * x + 0.26 * Math.sin(1.45 * x),
        formula: ["C=2\\pi y", "\\text{slant length}=ds", "dS=2\\pi y\\,ds", "S=\\int_a^b 2\\pi f(x)\\sqrt{1+[f'(x)]^2}\\,dx"],
        sampleLabel: "sample x",
        measureLabel: "slant length",
      },
    };

    let activeExample = examples[exampleInput.value];
    let slice = null;
    let radiusLine = null;
    let formulaVisible = false;
    let lastCompletedKey = "";
    let lastSliceKey = "";
    let lastShellKey = "";
    let lastRemainingWaterKey = "";

    const parseCssColor = raw => {
      if (raw == null || raw === "") return null;
      const value = String(raw).trim();
      if (!value) return null;
      if (value.startsWith("#")) {
        const hex = value.slice(1);
        if (hex.length === 3) {
          const expanded = hex.split("").map(ch => ch + ch).join("");
          const n = Number.parseInt(expanded, 16);
          return Number.isFinite(n) ? n : null;
        }
        const n = Number.parseInt(hex, 16);
        return Number.isFinite(n) ? n : null;
      }
      const n = Number.parseInt(value.replace("#", ""), 16);
      return Number.isFinite(n) ? n : null;
    };

    const materials = {
      region: new THREE.MeshStandardMaterial({
        color: 0xc4887a,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.55,
        metalness: 0.03,
      }),
      shell: new THREE.MeshStandardMaterial({
        color: 0xbc9a62,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.48,
        metalness: 0.04,
      }),
      completed: new THREE.MeshStandardMaterial({
        color: 0xa04a3f,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.58,
        metalness: 0.02,
      }),
      water: new THREE.MeshStandardMaterial({
        color: 0x3f8a5f,
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
        roughness: 0.38,
        metalness: 0.02,
      }),
      waterHighlight: new THREE.MeshStandardMaterial({
        color: 0x2f6f4d,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        roughness: 0.32,
        metalness: 0.02,
      }),
      bowl: new THREE.MeshStandardMaterial({
        color: 0xd7ccbb,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0.03,
      }),
      barn: new THREE.MeshStandardMaterial({
        color: 0x7b2d26,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.62,
      }),
      grazing: new THREE.MeshStandardMaterial({
        color: 0x3f8a5f,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        roughness: 0.5,
      }),
      grazingHighlight: new THREE.MeshStandardMaterial({
        color: 0x2f6f4d,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        roughness: 0.45,
      }),
      goatBody: new THREE.MeshStandardMaterial({ color: 0xfbf7f0, roughness: 0.5 }),
      goatHead: new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.45 }),
      point: new THREE.MeshStandardMaterial({ color: 0x7b2d26, roughness: 0.45 }),
      lineBlue: new THREE.LineBasicMaterial({ color: 0x7b2d26 }),
      lineGreen: new THREE.LineBasicMaterial({ color: 0x3f8a5f }),
      lineAmber: new THREE.LineBasicMaterial({ color: 0xbc9a62 }),
      lineRed: new THREE.LineBasicMaterial({ color: 0xa23b3b }),
      lineDark: new THREE.LineBasicMaterial({ color: 0x6b6158 }),
      grid: new THREE.LineBasicMaterial({ color: 0xd7ccbb, transparent: true, opacity: 0.55 }),
    };
    const sharedMaterials = new Set(Object.values(materials));

    function applyPalette(palette = {}) {
      if (!palette || typeof palette !== "object") return;
      const setMat = (mat, key, fallback) => {
        const parsed = parseCssColor(palette[key] ?? fallback);
        if (parsed != null && mat?.color) mat.color.setHex(parsed);
      };
      setMat(materials.region, "region", "#c4887a");
      setMat(materials.shell, "shell", "#bc9a62");
      setMat(materials.completed, "solid", "#a04a3f");
      setMat(materials.water, "water", "#3f8a5f");
      setMat(materials.waterHighlight, "teal", "#2f6f4d");
      setMat(materials.grazing, "water", "#3f8a5f");
      setMat(materials.grazingHighlight, "teal", "#2f6f4d");
      setMat(materials.bowl, "line", "#d7ccbb");
      setMat(materials.barn, "ink", "#7b2d26");
      setMat(materials.point, "ink", "#7b2d26");
      setMat(materials.goatBody, "panel", "#fbf7f0");
      setMat(materials.lineBlue, "ink", "#7b2d26");
      setMat(materials.lineGreen, "teal", "#3f8a5f");
      setMat(materials.lineAmber, "accent", "#bc9a62");
      setMat(materials.lineAmber, "shell", "#bc9a62");
      setMat(materials.lineRed, "red", "#a23b3b");
      setMat(materials.lineDark, "muted", "#6b6158");
      setMat(materials.grid, "line", "#d7ccbb");
      const canvas = parseCssColor(palette.canvas ? `#${String(palette.canvas).replace("#", "")}` : null);
      if (canvas != null) {
        renderer.setClearColor(canvas, 1);
        // Preserve current fog distances (set by applyViewLimits) so palette swaps
        // don't re-introduce washout on large-domain graphs.
        const near = scene.fog?.near ?? 18;
        const far = scene.fog?.far ?? 42;
        scene.fog = new THREE.Fog(canvas, near, far);
      }
      renderScene();
    }

    const paletteFromQuery = (() => {
      const raw = query.get("palette");
      if (!raw) return null;
      try {
        const decoded = decodeURIComponent(raw);
        return JSON.parse(decodeURIComponent(escape(atob(decoded))));
      } catch {
        try {
          return JSON.parse(decodeURIComponent(atob(raw)));
        } catch {
          return null;
        }
      }
    })();

    const ambient = new THREE.HemisphereLight(0xffffff, 0xb8c3cf, 2.25);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(4, 6, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf2ece1, 1.2);
    fillLight.position.set(-4, 2.2, -3);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 8),
      new THREE.ShadowMaterial({ color: 0x17212b, opacity: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    floor.receiveShadow = true;
    scene.add(floor);

    function makeLine(points, material) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      return new THREE.Line(geometry, material);
    }

    function clearGroup(group) {
      group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        const mat = child.material;
        if (!mat || sharedMaterials.has(mat)) return;
        if (Array.isArray(mat)) mat.forEach(m => { if (m && !sharedMaterials.has(m)) m.dispose(); });
        else mat.dispose();
      });
      group.clear();
    }

    function sampleCurveRange(fn, min, max, steps = 48) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i <= steps; i += 1) {
        const t = min + ((max - min) * i) / steps;
        const value = fn(t);
        if (Number.isFinite(value)) {
          lo = Math.min(lo, value);
          hi = Math.max(hi, value);
        }
      }
      if (!Number.isFinite(lo)) return { lo: min, hi: max };
      return { lo, hi };
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
        yMin = Math.min(0, bottom.lo, top.lo);
        yMax = Math.max(bottom.hi, top.hi);
      } else {
        yMin = ex.yMin ?? 0;
        yMax = ex.yMax ?? 3;
        const left = sampleCurveRange(ex.left, yMin, yMax);
        const right = sampleCurveRange(ex.right, yMin, yMax);
        xMin = Math.min(0, left.lo, right.lo);
        xMax = Math.max(left.hi, right.hi);
      }

      if (ex.axisX !== undefined) {
        xMin = Math.min(xMin, ex.axisX);
        xMax = Math.max(xMax, ex.axisX);
      }
      if (ex.axisY !== undefined) {
        yMin = Math.min(yMin, ex.axisY);
        yMax = Math.max(yMax, ex.axisY);
      }
      if (ex.marker) {
        xMin = Math.min(xMin, ex.marker.x);
        xMax = Math.max(xMax, ex.marker.x);
        yMin = Math.min(yMin, ex.marker.y);
        yMax = Math.max(yMax, ex.marker.y);
      }

      // Solids of revolution extend ±radius from the axis — include that in framing.
      if (ex.orientation === "vertical" && (ex.method?.startsWith("disk") || ex.method?.startsWith("washer") || ex.method?.startsWith("surface"))) {
        const axisY = ex.axisY ?? 0;
        let maxR = 0;
        const steps = 24;
        for (let i = 0; i <= steps; i += 1) {
          const x = xMin + ((xMax - xMin) * i) / steps;
          const lo = ex.bottom(x);
          const hi = ex.top(x);
          if (Number.isFinite(lo)) maxR = Math.max(maxR, Math.abs(axisY - lo));
          if (Number.isFinite(hi)) maxR = Math.max(maxR, Math.abs(axisY - hi));
        }
        yMin = Math.min(yMin, axisY - maxR);
        yMax = Math.max(yMax, axisY + maxR);
      } else if (ex.orientation === "horizontal" && (ex.method?.startsWith("disk") || ex.method?.startsWith("washer") || ex.method?.startsWith("surface"))) {
        const axisX = ex.axisX ?? 0;
        let maxR = 0;
        const steps = 24;
        for (let i = 0; i <= steps; i += 1) {
          const y = yMin + ((yMax - yMin) * i) / steps;
          const lo = ex.left(y);
          const hi = ex.right(y);
          if (Number.isFinite(lo)) maxR = Math.max(maxR, Math.abs(axisX - lo));
          if (Number.isFinite(hi)) maxR = Math.max(maxR, Math.abs(axisX - hi));
        }
        xMin = Math.min(xMin, axisX - maxR);
        xMax = Math.max(xMax, axisX + maxR);
      }

      const padX = Math.max(0.35, (xMax - xMin) * 0.1);
      const padY = Math.max(0.3, (yMax - yMin) * 0.1);
      return {
        xMin: xMin - padX,
        xMax: xMax + padX,
        yMin: yMin - padY,
        yMax: yMax + padY,
      };
    }

    function fitCameraToExample(ex) {
      const bounds = getSceneBounds(ex);
      const centerX = (bounds.xMin + bounds.xMax) / 2;
      const centerY = (bounds.yMin + bounds.yMax) / 2;
      let targetX = xToWorld(centerX);
      let targetY = yToWorld(centerY);

      if (ex.method === "shell-y" && ex.axisX !== undefined && ex.axisX !== 0) {
        targetX = (targetX + xToWorld(ex.axisX)) / 2;
      } else if (ex.method?.startsWith("shell-x") && ex.axisY !== undefined && ex.axisY !== 0) {
        targetY = (targetY + yToWorld(ex.axisY)) / 2;
      } else if (ex.method?.endsWith("-y") && ex.axisX !== undefined && ex.axisX !== 0) {
        targetX = (targetX + xToWorld(ex.axisX)) / 2;
      } else if (ex.method?.endsWith("-x") && ex.axisY !== undefined && ex.axisY !== 0) {
        targetY = (targetY + yToWorld(ex.axisY)) / 2;
      }

      const spanX = xToWorld(bounds.xMax) - xToWorld(bounds.xMin);
      const spanY = yToWorld(bounds.yMax) - yToWorld(bounds.yMin);
      // Cross-section solids and solids of revolution both extend in ±z.
      let spanZ = 0;
      if (ex.method === "cross-semicircle") {
        spanZ = yToWorld(Math.max(0, bounds.yMax - bounds.yMin) / 2);
      } else if (ex.method === "cross-square") {
        spanZ = yToWorld(Math.max(0, bounds.yMax - bounds.yMin));
      } else if (
        ex.method?.startsWith("disk") ||
        ex.method?.startsWith("washer") ||
        ex.method?.startsWith("shell") ||
        ex.method?.startsWith("surface")
      ) {
        // Revolution radius is already folded into bounds; z-extent ≈ half the y (or x) span about the axis.
        spanZ = Math.max(spanX, spanY) * 0.45;
      }
      const span = Math.max(spanX, spanY, spanZ, 1.4);
      const distance = span * 2.15 + 1.8;

      root.rotation.y = -0.42;
      // Bias look target slightly toward +z so disks/semicircles aren't edge-on.
      const targetZ = spanZ > 0 ? spanZ * 0.35 : 0;
      controls.target.set(targetX, targetY, targetZ);
      camera.position.set(
        targetX + distance * 0.72,
        targetY + distance * 0.52,
        distance * 0.82 + targetZ
      );
      applyViewLimits(distance);
      controls.update();
    }

    function makeGrid(ex) {
      const grid = new THREE.Group();
      const z = -0.015;
      const { xMin, xMax, yMin, yMax } = getSceneBounds(ex);
      const divisions = 8;
      for (let i = 0; i <= divisions; i += 1) {
        const x = xMin + ((xMax - xMin) * i) / divisions;
        grid.add(makeLine([
          new THREE.Vector3(xToWorld(x), yToWorld(yMin), z),
          new THREE.Vector3(xToWorld(x), yToWorld(yMax), z),
        ], materials.grid));
      }
      for (let i = 0; i <= divisions; i += 1) {
        const y = yMin + ((yMax - yMin) * i) / divisions;
        grid.add(makeLine([
          new THREE.Vector3(xToWorld(xMin), yToWorld(y), z),
          new THREE.Vector3(xToWorld(xMax), yToWorld(y), z),
        ], materials.grid));
      }
      return grid;
    }

    function verticalBounds(ex, x) {
      const lower = ex.bottom(x);
      const upper = ex.top(x);
      return {
        lower: Math.min(lower, upper),
        upper: Math.max(lower, upper),
      };
    }

    function horizontalBounds(ex, y) {
      const left = ex.left(y);
      const right = ex.right(y);
      return {
        left: Math.min(left, right),
        right: Math.max(left, right),
      };
    }

    /** Uniform samples plus exact breakpoints so piecewise tops (L-shapes) get sharp corners. */
    function sampleAxis(min, max, steps, breakpoints = []) {
      const values = new Set();
      for (let i = 0; i <= steps; i += 1) {
        values.add(min + (max - min) * i / steps);
      }
      for (const b of breakpoints) {
        if (Number.isFinite(b) && b >= min - 1e-9 && b <= max + 1e-9) {
          values.add(Math.min(max, Math.max(min, b)));
          // Sample both sides of a jump so the silhouette drops vertically.
          const eps = Math.max((max - min) * 1e-4, 1e-5);
          if (b - eps > min) values.add(b - eps);
          if (b + eps < max) values.add(b + eps);
        }
      }
      return [...values].sort((a, b) => a - b);
    }

    function piecewiseBreaks(ex) {
      // Spec may still hold raw curve descriptors on __rawTop when available; also probe cutout.
      const breaks = [];
      if (ex.cutout) {
        if (Number.isFinite(ex.cutout.xMin)) breaks.push(ex.cutout.xMin);
        if (Number.isFinite(ex.cutout.xMax)) breaks.push(ex.cutout.xMax);
      }
      if (Array.isArray(ex.piecewiseBreaks)) breaks.push(...ex.piecewiseBreaks);
      return breaks;
    }

    function makeRegion(ex) {
      const shape = new THREE.Shape();
      const steps = 72;
      if (ex.orientation === "vertical") {
        const x0 = ex.xMin;
        const x1 = ex.xMax;
        const xs = sampleAxis(x0, x1, steps, piecewiseBreaks(ex));
        const start = verticalBounds(ex, xs[0]);
        shape.moveTo(xToWorld(xs[0]), yToWorld(start.lower));
        for (const x of xs) {
          shape.lineTo(xToWorld(x), yToWorld(verticalBounds(ex, x).upper));
        }
        for (let i = xs.length - 1; i >= 0; i -= 1) {
          const x = xs[i];
          shape.lineTo(xToWorld(x), yToWorld(verticalBounds(ex, x).lower));
        }
      } else {
        const y0 = ex.yMin;
        const y1 = ex.yMax;
        const ys = sampleAxis(y0, y1, steps);
        const start = horizontalBounds(ex, ys[0]);
        shape.moveTo(xToWorld(start.left), yToWorld(ys[0]));
        for (const y of ys) {
          shape.lineTo(xToWorld(horizontalBounds(ex, y).right), yToWorld(y));
        }
        for (let i = ys.length - 1; i >= 0; i -= 1) {
          const y = ys[i];
          shape.lineTo(xToWorld(horizontalBounds(ex, y).left), yToWorld(y));
        }
      }
      const geometry = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geometry, materials.region);
      mesh.position.z = 0;
      return mesh;
    }

    function makeCurve(ex) {
      const group = new THREE.Group();
      const points = [];
      const lower = [];
      if (ex.orientation === "vertical") {
        for (let i = 0; i <= 160; i += 1) {
          const x = ex.xMin + (ex.xMax - ex.xMin) * i / 160;
          points.push(new THREE.Vector3(xToWorld(x), yToWorld(ex.top(x)), 0.012));
          lower.push(new THREE.Vector3(xToWorld(x), yToWorld(ex.bottom(x)), 0.014));
        }
      } else {
        for (let i = 0; i <= 160; i += 1) {
          const y = ex.yMin + (ex.yMax - ex.yMin) * i / 160;
          points.push(new THREE.Vector3(xToWorld(ex.right(y)), yToWorld(y), 0.012));
          lower.push(new THREE.Vector3(xToWorld(ex.left(y)), yToWorld(y), 0.014));
        }
      }
      group.add(makeLine(points, materials.lineBlue));
      group.add(makeLine(lower, materials.lineGreen));
      return group;
    }

    function makeAxes(ex) {
      const axes = new THREE.Group();
      const { xMin, xMax, yMin, yMax } = getSceneBounds(ex);
      const showCoords = ex.axisLabel !== "none";
      if (showCoords) {
        axes.add(makeLine([
          new THREE.Vector3(xToWorld(xMin), 0, 0.016),
          new THREE.Vector3(xToWorld(xMax), 0, 0.016),
        ], materials.lineDark));
        axes.add(makeLine([
          new THREE.Vector3(0, yToWorld(yMin), 0.016),
          new THREE.Vector3(0, yToWorld(yMax), 0.016),
        ], materials.lineRed));
      }
      if (ex.axisX !== undefined && ex.axisX !== 0) {
        axes.add(makeLine([
          new THREE.Vector3(xToWorld(ex.axisX), yToWorld(yMin), 0.03),
          new THREE.Vector3(xToWorld(ex.axisX), yToWorld(yMax), 0.03),
        ], materials.lineRed));
      }
      if (ex.axisY !== undefined && ex.axisY !== 0) {
        axes.add(makeLine([
          new THREE.Vector3(xToWorld(xMin), yToWorld(ex.axisY), 0.03),
          new THREE.Vector3(xToWorld(xMax), yToWorld(ex.axisY), 0.03),
        ], materials.lineRed));
      }
      if (ex.method?.startsWith("shell") || ex.method?.startsWith("disk") || ex.method?.startsWith("washer")) {
        const depth = Math.max(xToWorld(xMax) - xToWorld(xMin), 1.2) * 0.55;
        axes.add(makeLine([
          new THREE.Vector3(0, 0, -depth),
          new THREE.Vector3(0, 0, depth),
        ], materials.lineDark));
      }
      return axes;
    }

    function makeSlice(ex, value, width, material = materials.shell) {
      const shape = new THREE.Shape();
      if (ex.orientation === "vertical") {
        const x0 = value - width / 2;
        const x1 = value + width / 2;
        const b0 = verticalBounds(ex, x0);
        const b1 = verticalBounds(ex, x1);
        shape.moveTo(xToWorld(x0), yToWorld(b0.lower));
        shape.lineTo(xToWorld(x1), yToWorld(b1.lower));
        shape.lineTo(xToWorld(x1), yToWorld(b1.upper));
        shape.lineTo(xToWorld(x0), yToWorld(b0.upper));
      } else {
        const y0 = value - width / 2;
        const y1 = value + width / 2;
        const b0 = horizontalBounds(ex, y0);
        const b1 = horizontalBounds(ex, y1);
        shape.moveTo(xToWorld(b0.left), yToWorld(y0));
        shape.lineTo(xToWorld(b1.left), yToWorld(y1));
        shape.lineTo(xToWorld(b1.right), yToWorld(y1));
        shape.lineTo(xToWorld(b0.right), yToWorld(y0));
      }
      const geometry = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      return mesh;
    }

    function makeTube(axis, center, length, innerRadius, outerRadius, angle, material, thickness = 0, axisOffset = 0) {
      const segments = Math.max(3, Math.ceil(72 * angle / (Math.PI * 2)));
      const half = (axis === "x" ? xToWorld(length) : yToWorld(length)) / 2;
      const inner = axis === "x" ? yToWorld(Math.max(0, innerRadius)) : xToWorld(Math.max(0, innerRadius));
      const outer = axis === "x" ? yToWorld(Math.max(0.006, outerRadius)) : xToWorld(Math.max(0.006, outerRadius));
      const positions = [];
      const indices = [];
      const row = segments + 1;

      function point(axial, radius, theta) {
        if (axis === "x") {
          return [
            xToWorld(center) + axial,
            yToWorld(axisOffset) + radius * Math.cos(theta),
            radius * Math.sin(theta),
          ];
        }
        return [
          xToWorld(axisOffset) + radius * Math.cos(theta),
          yToWorld(center) + axial,
          radius * Math.sin(theta),
        ];
      }

      for (let layer = 0; layer < 4; layer += 1) {
        const r = layer < 2 ? inner : outer;
        const axial = layer % 2 === 0 ? -half : half;
        for (let i = 0; i <= segments; i += 1) {
          const t = angle * i / segments;
          positions.push(...point(axial, r, t));
        }
      }

      const innerBottom = 0;
      const innerTop = row;
      const outerBottom = row * 2;
      const outerTop = row * 3;

      for (let i = 0; i < segments; i += 1) {
        const ib0 = innerBottom + i;
        const ib1 = innerBottom + i + 1;
        const it0 = innerTop + i;
        const it1 = innerTop + i + 1;
        const ob0 = outerBottom + i;
        const ob1 = outerBottom + i + 1;
        const ot0 = outerTop + i;
        const ot1 = outerTop + i + 1;

        indices.push(ob0, ob1, ot0, ot0, ob1, ot1);
        indices.push(ib1, ib0, it1, it1, ib0, it0);
        indices.push(it0, it1, ot0, ot0, it1, ot1);
        indices.push(ib1, ib0, ob1, ob1, ib0, ob0);
      }

      indices.push(innerBottom, outerBottom, innerTop, innerTop, outerBottom, outerTop);
      indices.push(innerBottom + segments, innerTop + segments, outerBottom + segments);
      indices.push(outerBottom + segments, innerTop + segments, outerTop + segments);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      return mesh;
    }

    function makeShell(ex, value, angle, material, thickness) {
      if (ex.orientation === "vertical") {
        const bounds = verticalBounds(ex, value);
        const height = bounds.upper - bounds.lower;
        const radius = Math.abs((ex.axisX ?? 0) - value);
        return makeTube("y", bounds.lower + height / 2, height, Math.max(0, radius - thickness / 2), radius + thickness / 2, angle, material, thickness, ex.axisX ?? 0);
      }
      const bounds = horizontalBounds(ex, value);
      const height = bounds.right - bounds.left;
      const radius = Math.abs(value - (ex.axisY ?? 0));
      return makeTube("x", bounds.left + height / 2, height, Math.max(0, radius - thickness / 2), radius + thickness / 2, angle, material, thickness, ex.axisY ?? 0);
    }

    function makeWasherOrDisk(ex, value, angle, material, thickness) {
      // Outer/inner radii = distance from axis of revolution to the far/near edge of the slice.
      // When the region touches the axis, min distance is 0 and we get a solid disk.
      // Do not force inner=0 for method "disk-*" — a mis-specified region that does not
      // touch the axis must still render as a washer (hole), matching the integral.
      if (ex.orientation === "vertical") {
        const bounds = verticalBounds(ex, value);
        const axisY = ex.axisY ?? 0;
        const dLo = Math.abs(axisY - bounds.lower);
        const dHi = Math.abs(axisY - bounds.upper);
        const outer = Math.max(dLo, dHi);
        const inner = Math.min(dLo, dHi);
        return makeTube("x", value, thickness, inner, outer, angle, material, thickness, axisY);
      }
      const bounds = horizontalBounds(ex, value);
      const axisX = ex.axisX ?? 0;
      const dL = Math.abs(axisX - bounds.left);
      const dR = Math.abs(axisX - bounds.right);
      const outer = Math.max(dL, dR);
      const inner = Math.min(dL, dR);
      return makeTube("y", value, thickness, inner, outer, angle, material, thickness, axisX);
    }

    function makePoint(x, y, color = null, radius = 0.026) {
      const useShared = color == null || color === 0x7b2d26;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        useShared
          ? materials.point
          : new THREE.MeshStandardMaterial({
              color,
              roughness: 0.45,
              metalness: 0.05,
              transparent: true,
              opacity: 0.95
            })
      );
      mesh.position.set(xToWorld(x), yToWorld(y), 0.04);
      mesh.userData.isPoint = true;
      return mesh;
    }

    /** Outline of a removed rectangular piece (composite L-shapes, etc.). */
    function makeCutoutGhost(cutout) {
      if (!cutout) return null;
      const x0 = Number(cutout.xMin);
      const x1 = Number(cutout.xMax);
      const y0 = Number(cutout.yMin);
      const y1 = Number(cutout.yMax);
      if (![x0, x1, y0, y1].every(Number.isFinite)) return null;
      const group = new THREE.Group();
      group.name = "cutoutGhost";
      group.userData.isCutoutGhost = true;
      const z = 0.028;
      // This overlay fades independently. A private material prevents the
      // fade from mutating the shared red curve/axis material.
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: 0xa23b3b,
        transparent: true,
        opacity: 0.9,
      });
      const corners = [
        [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]
      ].map(([x, y]) => new THREE.Vector3(xToWorld(x), yToWorld(y), z));
      group.add(makeLine(corners, outlineMaterial));
      // Light fill so the "missing" corner is obvious against the L-region.
      const shape = new THREE.Shape();
      shape.moveTo(xToWorld(x0), yToWorld(y0));
      shape.lineTo(xToWorld(x1), yToWorld(y0));
      shape.lineTo(xToWorld(x1), yToWorld(y1));
      shape.lineTo(xToWorld(x0), yToWorld(y1));
      shape.closePath();
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xa23b3b,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), fillMat);
      fill.position.z = 0.01;
      group.add(fill);
      return group;
    }

    /** Secondary markers for composite parts (keep / remove centers). */
    function makePartMarkers(parts) {
      if (!Array.isArray(parts) || !parts.length) return null;
      const group = new THREE.Group();
      group.name = "partMarkers";
      for (const part of parts) {
        if (!Number.isFinite(part?.x) || !Number.isFinite(part?.y)) continue;
        const remove = part.role === "remove";
        const color = remove ? 0xa23b3b : 0x3f8a5f;
        const pt = makePoint(part.x, part.y, color, remove ? 0.018 : 0.02);
        pt.userData.partRole = part.role || "keep";
        group.add(pt);
      }
      return group;
    }

    function isAreaStripMethod(method) {
      return method === "area" || method === "centroid" || method === "inertia";
    }

    function makeArcApproximation(ex, count, reveal) {
      const group = new THREE.Group();
      const shown = Math.max(1, Math.floor(count * reveal));
      const horizontal = ex.orientation === "horizontal";
      const step = (horizontal ? ex.yMax - ex.yMin : ex.xMax - ex.xMin) / count;
      const pointAt = value => horizontal
        ? [ex.right(value), value]
        : [value, ex.top(value)];
      for (let i = 0; i <= shown; i += 1) {
        const value = (horizontal ? ex.yMin : ex.xMin) + step * i;
        const [px, py] = pointAt(value);
        group.add(makePoint(px, py));
      }
      for (let i = 0; i < shown; i += 1) {
        const v0 = (horizontal ? ex.yMin : ex.xMin) + step * i;
        const v1 = v0 + step;
        const [x0, y0] = pointAt(v0);
        const [x1, y1] = pointAt(v1);
        group.add(makeLine([
          new THREE.Vector3(xToWorld(x0), yToWorld(y0), 0.06),
          new THREE.Vector3(xToWorld(x1), yToWorld(y1), 0.06),
        ], materials.lineAmber));
        group.add(makeLine(horizontal
          ? [
              new THREE.Vector3(xToWorld(x0), yToWorld(y0), 0.045),
              new THREE.Vector3(xToWorld(x0), yToWorld(y1), 0.045),
              new THREE.Vector3(xToWorld(x1), yToWorld(y1), 0.045),
            ]
          : [
              new THREE.Vector3(xToWorld(x0), yToWorld(y0), 0.045),
              new THREE.Vector3(xToWorld(x1), yToWorld(y0), 0.045),
              new THREE.Vector3(xToWorld(x1), yToWorld(y1), 0.045),
            ], materials.lineGreen));
      }
      return group;
    }

    function makeSurfaceBand(ex, x0, x1, angle, material) {
      const segments = Math.max(8, Math.ceil(72 * angle / (Math.PI * 2)));
      const axisY = ex.axisY ?? 0;
      const r0 = yToWorld(Math.abs(ex.top(x0) - axisY));
      const r1 = yToWorld(Math.abs(ex.top(x1) - axisY));
      const positions = [];
      const indices = [];
      for (let side = 0; side < 2; side += 1) {
        const x = side === 0 ? x0 : x1;
        const r = side === 0 ? r0 : r1;
        for (let i = 0; i <= segments; i += 1) {
          const t = angle * i / segments;
          positions.push(xToWorld(x), yToWorld(axisY) + r * Math.cos(t), r * Math.sin(t));
        }
      }
      const row = segments + 1;
      for (let i = 0; i < segments; i += 1) {
        indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, material);
    }

    function surfaceYRadiusAndHeight(ex, value) {
      if (ex.orientation === "horizontal") {
        const bounds = horizontalBounds(ex, value);
        const curveX = Math.abs(bounds.right) >= Math.abs(bounds.left) ? bounds.right : bounds.left;
        return {
          radius: Math.abs((ex.axisX ?? 0) - curveX),
          y: value
        };
      }
      return {
        radius: Math.abs((ex.axisX ?? 0) - value),
        y: ex.top(value)
      };
    }

    function makeSurfaceBandY(ex, v0, v1, angle, material) {
      const segments = Math.max(8, Math.ceil(72 * angle / (Math.PI * 2)));
      const positions = [];
      const indices = [];
      for (let side = 0; side < 2; side += 1) {
        const { radius, y } = surfaceYRadiusAndHeight(ex, side === 0 ? v0 : v1);
        for (let i = 0; i <= segments; i += 1) {
          const t = angle * i / segments;
          positions.push(
            xToWorld(ex.axisX ?? 0) + xToWorld(radius) * Math.cos(t),
            yToWorld(y),
            xToWorld(radius) * Math.sin(t)
          );
        }
      }
      const row = segments + 1;
      for (let i = 0; i < segments; i += 1) {
        indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, material);
    }

    function makeCircumferenceRing(x, radius, material, axisY = 0) {
      const points = [];
      for (let i = 0; i <= 96; i += 1) {
        const t = Math.PI * 2 * i / 96;
        const r = yToWorld(Math.abs(radius - axisY));
        points.push(new THREE.Vector3(xToWorld(x), yToWorld(axisY) + r * Math.cos(t), r * Math.sin(t)));
      }
      return makeLine(points, material);
    }

    function makeCircumferenceRingY(ex, value, material) {
      const { radius, y } = surfaceYRadiusAndHeight(ex, value);
      const points = [];
      for (let i = 0; i <= 96; i += 1) {
        const t = Math.PI * 2 * i / 96;
        points.push(new THREE.Vector3(
          xToWorld(ex.axisX ?? 0) + xToWorld(radius) * Math.cos(t),
          yToWorld(y),
          xToWorld(radius) * Math.sin(t)
        ));
      }
      return makeLine(points, material);
    }

    function makeCrossSection(ex, value, width, material, reveal = 1) {
      const bounds = verticalBounds(ex, value);
      const side = Math.max(0.01, bounds.upper - bounds.lower);
      const shownSide = side * Math.max(0.02, Math.min(1, reveal));
      if (ex.method === "cross-semicircle") {
        // Diameter lies in the base (along y from lower→upper); semicircle rises in +z.
        // Cylinder default: axis Y, circle in XZ. After rotateZ(π/2), axis is X (slice
        // thickness). thetaStart=-π/2 puts the flat diameter along Y and the bulge in +Z.
        const diameter = side;
        const radius = yToWorld(diameter / 2);
        const length = Math.max(0.01, xToWorld(width));
        const revealAmt = Math.max(0.02, Math.min(1, reveal));
        const geometry = new THREE.CylinderGeometry(
          radius, radius, length, 32, 1, false, -Math.PI / 2, Math.PI
        );
        geometry.rotateZ(Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          xToWorld(value),
          yToWorld(bounds.lower + diameter / 2),
          0
        );
        // Grow only out of the base plane so the diameter stays on the region.
        mesh.scale.z = revealAmt;
        mesh.castShadow = true;
        return mesh;
      }
      const geometry = new THREE.BoxGeometry(
        Math.max(0.01, xToWorld(width)),
        yToWorld(shownSide),
        yToWorld(shownSide)
      );
      geometry.translate(xToWorld(value), yToWorld(bounds.lower + shownSide / 2), 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      return mesh;
    }

    function bowlRadius(y) {
      const radius = Number(activeExample?.bowlRadius) || 3;
      const centerY = Number(activeExample?.bowlCenterY) || radius;
      return Math.sqrt(Math.max(0, radius * radius - (y - centerY) * (y - centerY)));
    }

    function bowlSpoutHeight() {
      return Number(activeExample?.spoutHeight) || 8;
    }

    function makeWaterDisk(y, thickness, material = materials.water) {
      const radius = bowlRadius(y);
      const geometry = new THREE.CylinderGeometry(xToWorld(radius), xToWorld(radius), Math.max(0.012, yToWorld(thickness)), 72, 1, false);
      geometry.translate(0, yToWorld(y), 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = false;
      return mesh;
    }

    function makeBowlModel() {
      const group = new THREE.Group();
      const rings = 18;
      const centerY = Number(activeExample?.bowlCenterY) || 3;
      const spoutHeight = bowlSpoutHeight();
      for (let i = 0; i <= rings; i += 1) {
        const y = centerY * i / rings;
        const radius = bowlRadius(y);
        group.add(makeLine(
          Array.from({ length: 73 }, (_, j) => {
            const t = Math.PI * 2 * j / 72;
            return new THREE.Vector3(xToWorld(radius) * Math.cos(t), yToWorld(y), xToWorld(radius) * Math.sin(t));
          }),
          materials.grid
        ));
      }
      group.add(makeLine([
        new THREE.Vector3(0, yToWorld(0), 0),
        new THREE.Vector3(0, yToWorld(spoutHeight), 0),
      ], materials.lineRed));
      return group;
    }

    function makePumpSample(y, progress) {
      const group = new THREE.Group();
      const spoutHeight = bowlSpoutHeight();
      const liftY = y + (spoutHeight - y) * progress;
      const disk = makeWaterDisk(liftY, 0.09, materials.waterHighlight);
      group.add(disk);
      group.add(makeLine([
        new THREE.Vector3(xToWorld(bowlRadius(y) + 0.2), yToWorld(y), 0),
        new THREE.Vector3(xToWorld(bowlRadius(y) + 0.2), yToWorld(spoutHeight), 0),
      ], materials.lineAmber));
      return group;
    }

    function makeFilledWater(yMin, yMax, count = 16) {
      const group = new THREE.Group();
      const dy = (yMax - yMin) / count;
      for (let i = 0; i < count; i += 1) {
        const y = yMin + dy * (i + 0.5);
        group.add(makeWaterDisk(y, dy, materials.water));
      }
      return group;
    }

    const poolTopY = 0.95;
    const poolLengthScale = 0.22;
    const poolWidthScale = 0.22;

    function poolXToWorld(x) {
      return (x - 10) * poolLengthScale;
    }

    function poolZToWorld(z) {
      return z * poolWidthScale;
    }

    function poolDepth(x) {
      return 1 + x / 10;
    }

    function makePoolSlab(x0, x1, material = materials.water) {
      const midX = (x0 + x1) / 2;
      const depth = poolDepth(midX);
      const geometry = new THREE.BoxGeometry(
        Math.max(0.01, (x1 - x0) * poolLengthScale),
        yToWorld(depth),
        8 * poolWidthScale
      );
      geometry.translate(poolXToWorld(midX), poolTopY - yToWorld(depth) / 2, 0);
      return new THREE.Mesh(geometry, material);
    }

    function makePoolModel() {
      const group = new THREE.Group();
      const topLeft = poolXToWorld(0);
      const topRight = poolXToWorld(20);
      const near = poolZToWorld(-4);
      const far = poolZToWorld(4);
      const shallowBottom = poolTopY - yToWorld(1);
      const deepBottom = poolTopY - yToWorld(3);
      const cornersTop = [
        new THREE.Vector3(topLeft, poolTopY, near),
        new THREE.Vector3(topRight, poolTopY, near),
        new THREE.Vector3(topRight, poolTopY, far),
        new THREE.Vector3(topLeft, poolTopY, far),
        new THREE.Vector3(topLeft, poolTopY, near),
      ];
      const cornersBottom = [
        new THREE.Vector3(topLeft, shallowBottom, near),
        new THREE.Vector3(topRight, deepBottom, near),
        new THREE.Vector3(topRight, deepBottom, far),
        new THREE.Vector3(topLeft, shallowBottom, far),
        new THREE.Vector3(topLeft, shallowBottom, near),
      ];
      group.add(makeLine(cornersTop, materials.lineBlue));
      group.add(makeLine(cornersBottom, materials.lineDark));
      [
        [topLeft, shallowBottom, near],
        [topLeft, shallowBottom, far],
        [topRight, deepBottom, near],
        [topRight, deepBottom, far],
      ].forEach(([x, y, z]) => {
        group.add(makeLine([
          new THREE.Vector3(x, poolTopY, z),
          new THREE.Vector3(x, y, z),
        ], materials.grid));
      });
      for (let x = 0; x <= 20; x += 4) {
        const wx = poolXToWorld(x);
        const bottomY = poolTopY - yToWorld(poolDepth(x));
        group.add(makeLine([
          new THREE.Vector3(wx, poolTopY, far + 0.08),
          new THREE.Vector3(wx, bottomY, far + 0.08),
        ], materials.grid));
      }
      group.add(makeLine([
        new THREE.Vector3(topLeft - 0.22, poolTopY + 0.08, 0),
        new THREE.Vector3(topLeft - 0.22, shallowBottom, 0),
      ], materials.lineRed));
      return group;
    }

    function makePoolFill(count, reveal) {
      const group = new THREE.Group();
      const shown = Math.floor(count * reveal);
      const dx = 20 / count;
      for (let i = 0; i < shown; i += 1) {
        const x0 = dx * i;
        group.add(makePoolSlab(x0, x0 + dx, materials.water));
      }
      if (shown < count && reveal > 0) {
        const partial = count * reveal - shown;
        const x0 = dx * shown;
        group.add(makePoolSlab(x0, x0 + dx * partial, materials.waterHighlight));
      }
      return group;
    }

    function makePoolSample(x, width) {
      const group = new THREE.Group();
      const x0 = Math.max(0, x - width / 2);
      const x1 = Math.min(20, x + width / 2);
      group.add(makePoolSlab(x0, x1, materials.waterHighlight));
      const wx = poolXToWorld(x);
      const bottomY = poolTopY - yToWorld(poolDepth(x));
      group.add(makeLine([
        new THREE.Vector3(wx, poolTopY + 0.14, poolZToWorld(4.35)),
        new THREE.Vector3(wx, bottomY, poolZToWorld(4.35)),
      ], materials.lineAmber));
      return group;
    }

    function makeFlatShapeMesh(shape, material, y = 0.01) {
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, y, 0);
      return new THREE.Mesh(geometry, material);
    }

    function makeRectMesh(x0, z0, width, depth, material) {
      const shape = new THREE.Shape();
      shape.moveTo(xToWorld(x0), yToWorld(z0));
      shape.lineTo(xToWorld(x0 + width), yToWorld(z0));
      shape.lineTo(xToWorld(x0 + width), yToWorld(z0 + depth));
      shape.lineTo(xToWorld(x0), yToWorld(z0 + depth));
      shape.lineTo(xToWorld(x0), yToWorld(z0));
      return makeFlatShapeMesh(shape, material, 0.035);
    }

    function makeSectorMesh(cx, cz, radius, startAngle, endAngle, material) {
      const shape = new THREE.Shape();
      shape.moveTo(xToWorld(cx), yToWorld(cz));
      const steps = 90;
      for (let i = 0; i <= steps; i += 1) {
        const a = startAngle + (endAngle - startAngle) * i / steps;
        shape.lineTo(
          xToWorld(cx + radius * Math.cos(a)),
          yToWorld(cz + radius * Math.sin(a))
        );
      }
      shape.lineTo(xToWorld(cx), yToWorld(cz));
      return makeFlatShapeMesh(shape, material, 0.02);
    }

    function makeGoatBarnBase() {
      const group = new THREE.Group();
      group.add(makeRectMesh(0, 0, 6, 4, materials.barn));
      group.add(makeLine([
        new THREE.Vector3(xToWorld(0), 0.07, yToWorld(0)),
        new THREE.Vector3(xToWorld(-1.0), 0.07, yToWorld(-0.7)),
      ], materials.lineAmber));
      group.add(makePoint(0, 0, 0xdd7d22));
      return group;
    }

    function makeGoatGrazing(progress) {
      const group = new THREE.Group();
      const stage = progress < 0.43 ? 1 : progress < 0.72 ? 2 : 3;
      if (stage >= 1) {
        const phase = stage === 1 ? clamp01(progress / 0.43) : 1;
        const endAngle = Math.PI / 2 + phase * Math.PI * 1.5;
        if (endAngle > Math.PI / 2 + 0.001) {
          group.add(makeSectorMesh(0, 0, 10, Math.PI / 2, endAngle, materials.grazing));
        }
      }
      if (stage >= 2) {
        const phase = stage === 2 ? clamp01((progress - 0.43) / 0.29) : 1;
        const endAngle = phase * Math.PI / 2;
        if (endAngle > 0.001) {
          group.add(makeSectorMesh(6, 0, 4, 0, endAngle, materials.grazingHighlight));
        }
      }
      if (stage >= 3) {
        const phase = clamp01((progress - 0.72) / 0.28);
        const endAngle = phase * Math.PI / 2;
        if (endAngle > 0.001) {
          group.add(makeSectorMesh(0, 4, 6, 0, endAngle, materials.grazingHighlight));
        }
      }
      return group;
    }

    function makeGoatMarker(x, z) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 18, 12),
        materials.goatBody
      );
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 14, 10),
        materials.goatHead
      );
      body.position.set(xToWorld(x), 0.13, yToWorld(z));
      head.position.set(xToWorld(x) + 0.06, 0.16, yToWorld(z) - 0.035);
      group.add(body, head);
      return group;
    }

    function makeLeashPath(points) {
      return makeLine(
        points.map(([x, z]) => new THREE.Vector3(xToWorld(x), 0.105, yToWorld(z))),
        materials.lineAmber
      );
    }

    function makeGoatActor(progress) {
      const group = new THREE.Group();
      const stage = progress < 0.43 ? 1 : progress < 0.72 ? 2 : 3;
      let goat;
      let leashPoints;
      if (stage === 1) {
        const phase = clamp01(progress / 0.43);
        const angle = Math.PI / 2 + phase * Math.PI * 1.5;
        goat = [10 * Math.cos(angle), 10 * Math.sin(angle)];
        leashPoints = [[0, 0], goat];
      } else if (stage === 2) {
        const phase = clamp01((progress - 0.43) / 0.29);
        const angle = phase * Math.PI / 2;
        goat = [6 + 4 * Math.cos(angle), 4 * Math.sin(angle)];
        leashPoints = [[0, 0], [6, 0], goat];
      } else {
        const phase = clamp01((progress - 0.72) / 0.28);
        const angle = phase * Math.PI / 2;
        goat = [6 * Math.cos(angle), 4 + 6 * Math.sin(angle)];
        leashPoints = [[0, 0], [0, 4], goat];
      }
      group.add(makeLeashPath(leashPoints));
      group.add(makeGoatMarker(goat[0], goat[1]));
      return group;
    }

    function makeShellRim(ex, value, angle, material) {
      const pointsTop = [];
      const pointsBottom = [];
      const steps = Math.max(5, Math.ceil(72 * angle / (Math.PI * 2)));
      const axis = ex.orientation === "vertical" ? "y" : "x";
      const radius = axis === "y" ? Math.abs((ex.axisX ?? 0) - value) : Math.abs(value - (ex.axisY ?? 0));
      const bounds = axis === "y" ? verticalBounds(ex, value) : horizontalBounds(ex, value);
      const start = axis === "y" ? bounds.lower : bounds.left;
      const length = axis === "y" ? bounds.upper - bounds.lower : bounds.right - bounds.left;
      for (let i = 0; i <= steps; i += 1) {
        const t = angle * i / steps;
        if (axis === "y") {
          pointsTop.push(new THREE.Vector3(xToWorld(ex.axisX ?? 0) + xToWorld(radius) * Math.cos(t), yToWorld(start + length), xToWorld(radius) * Math.sin(t)));
          pointsBottom.push(new THREE.Vector3(xToWorld(ex.axisX ?? 0) + xToWorld(radius) * Math.cos(t), yToWorld(start), xToWorld(radius) * Math.sin(t)));
        } else {
          pointsTop.push(new THREE.Vector3(xToWorld(start + length), yToWorld(ex.axisY ?? 0) + yToWorld(radius) * Math.cos(t), yToWorld(radius) * Math.sin(t)));
          pointsBottom.push(new THREE.Vector3(xToWorld(start), yToWorld(ex.axisY ?? 0) + yToWorld(radius) * Math.cos(t), yToWorld(radius) * Math.sin(t)));
        }
      }
      const group = new THREE.Group();
      group.add(makeLine(pointsTop, material));
      group.add(makeLine(pointsBottom, material));
      return group;
    }

    const regionGroup = new THREE.Group();
    root.add(regionGroup);

    const waterFillGroup = new THREE.Group();
    root.add(waterFillGroup);

    const sliceGroup = new THREE.Group();
    root.add(sliceGroup);

    const shellGroup = new THREE.Group();
    root.add(shellGroup);

    const completedShells = new THREE.Group();
    root.add(completedShells);

    const guideGroup = new THREE.Group();
    root.add(guideGroup);

    let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let progress = 0;
    let previous = performance.now();
    let animationFrame = 0;
    let sceneVisible = true;

    function playbackSpeed() {
      const speed = Number(speedInput.value);
      return Number.isFinite(speed) && speed > 0 ? speed : 1;
    }

    function startPlayback() {
      if (Number(progressInput.value) >= 0.999) {
        progress = 0;
        progressInput.value = "0";
        updateScene();
      }
      playing = true;
      playButton.textContent = "Pause";
      previous = performance.now();
      ensureAnimationLoop();
    }

    function setFormulaVisibility(visible) {
      formulaVisible = visible;
      formulaPanel.classList.toggle("formula-hidden", !visible);
      formulaPanel.setAttribute("aria-hidden", String(!visible));
      toggleFormulaButton.textContent = visible ? "Hide equation" : "Show equation";
      if (visible && window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([formulaPanel]);
      }
    }

    function renderFormula() {
      if (!formulaPanel) return;
      // Use DOM APIs only — never assign untrusted formula strings via innerHTML.
      formulaPanel.replaceChildren();
      const lines = Array.isArray(activeExample?.formula) ? activeExample.formula : [];
      lines.forEach((line, index) => {
        const span = document.createElement("span");
        const latex = `\\(${String(line ?? "")}\\)`;
        if (index === lines.length - 1) {
          const strong = document.createElement("strong");
          strong.textContent = latex;
          span.appendChild(strong);
        } else {
          span.textContent = latex;
        }
        formulaPanel.appendChild(span);
      });
      if (formulaVisible && window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([formulaPanel]);
      }
    }

    function decodeConfigParam(raw) {
      if (!raw) return null;
      // Bound URL-carried specs to limit parse / memory abuse.
      if (String(raw).length > 50_000) return null;
      try {
        const decoded = decodeURIComponent(raw);
        const json = decodeURIComponent(escape(atob(decoded)));
        if (json.length > 100_000) return null;
        const parsed = JSON.parse(json);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        try {
          const json = decodeURIComponent(atob(raw));
          if (json.length > 100_000) return null;
          const parsed = JSON.parse(json);
          return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
          try {
            const json = decodeURIComponent(raw);
            if (json.length > 100_000) return null;
            const parsed = JSON.parse(json);
            return parsed && typeof parsed === "object" ? parsed : null;
          } catch {
            return null;
          }
        }
      }
    }

    function applyDynamicSpec(spec) {
      if (!spec) return false;
      const built = buildExampleFromSpec(spec);
      if (!built) return false;
      examples.dynamic = normalizeExample(built);
      return true;
    }

    // The renderer and its materials stay unchanged; only this configuration is
    // supplied by the active question in CEE 103.
    if (query.get("example") === "dynamic") {
      const specFromUrl = decodeConfigParam(query.get("config"));
      if (!applyDynamicSpec(specFromUrl)) {
        const mode = query.get("mode");
        const a = Number(query.get("a")) || 1;
        const b = Number(query.get("b")) || 1;
        const n = Number(query.get("n")) || 1;
        const useWashers = query.get("method") === "washers";
        applyDynamicSpec(mode === "area"
          ? { title: "Problem: Area", subtitle: `Find the area under y = ${a}x from x = 0 to x = ${b}.`, orientation: "vertical", method: "area", xMin: 0, xMax: b, bottom: { t: "c", v: 0 }, top: { t: "lin", a }, formula: [], sampleLabel: "sample x", measureLabel: "strip height" }
          : mode === "centroid"
            ? { title: "Problem: Centroid", subtitle: `Locate the centroid of the triangle with base ${b} and height ${a}.`, orientation: "vertical", method: "area", xMin: 0, xMax: b, bottom: { t: "c", v: 0 }, top: { t: "lin", a, b: 0 }, marker: { x: b / 3, y: a / 3 }, formula: [], sampleLabel: "sample x", measureLabel: "strip height" }
            : mode === "inertia"
              ? { title: "Problem: Area Moment of Inertia", subtitle: `Rectangle with base ${b} and height ${a}.`, orientation: "vertical", method: "area", xMin: 0, xMax: b, bottom: { t: "c", v: 0 }, top: { t: "c", v: a }, formula: [], sampleLabel: "sample x", measureLabel: "strip height" }
              : mode === "arc"
                ? { title: "Problem: Arc Length", subtitle: `Find the length of y = ${a}x + ${b} from x = 0 to x = ${n}.`, orientation: "vertical", method: "arc", axisLabel: "none", xMin: 0, xMax: n, bottom: { t: "c", v: 0 }, top: { t: "lin", a, b }, formula: [`f'(x)=${a}`, `ds=\\sqrt{1+${a}^2}\\,dx`], sampleLabel: "sample x", measureLabel: "segment length" }
                : mode === "surface"
                  ? { title: "Problem: Surface Area", subtitle: `Rotate y = ${a}x + ${b} from x = 0 to x = ${n} about the x-axis.`, orientation: "vertical", method: "surface-x", axisLabel: "y = 0", axisY: 0, xMin: 0, xMax: n, bottom: { t: "c", v: 0 }, top: { t: "lin", a, b }, formula: [`f'(x)=${a}`, `dS=2\\pi(${a}x+${b})\\sqrt{1+${a}^2}\\,dx`], sampleLabel: "sample x", measureLabel: "slant length" }
                  : useWashers
                    ? { title: "Problem: Washer Method", subtitle: `Use horizontal disks for the region under y = ${a}x from x = 0 to x = ${b}.`, orientation: "horizontal", method: "disk-y", axisLabel: "x = 0", axisX: 0, yMin: 0, yMax: a * b, left: { t: "c", v: 0 }, right: { t: "lin", a: 1 / a }, formula: [], sampleLabel: "sample y", measureLabel: "disk radius" }
                    : { title: "Problem: Shell Method", subtitle: `Rotate the region under y = ${a}x from x = 0 to x = ${b} about the y-axis.`, orientation: "vertical", method: "shell-y", axisLabel: "x = 0", axisX: 0, xMin: 0, xMax: b, bottom: { t: "c", v: 0 }, top: { t: "lin", a }, formula: ["r=x", `h=${a}x`, `dV=2\\pi x(${a}x)\\,dx`], sampleLabel: "sample x", measureLabel: "shell height" });
      }
      const shellsQ = Number(query.get("shells"));
      if (Number.isFinite(shellsQ) && shellsQ >= 4) shellCountInput.value = String(Math.min(48, Math.round(shellsQ)));
      const speedQ = Number(query.get("speed"));
      if (Number.isFinite(speedQ) && speedQ > 0) speedInput.value = String(Math.min(3, Math.max(0.25, speedQ)));
    }

    const stepDetailText = {
      region: () => stepRegionText.textContent,
      slice: () => stepSliceText.textContent,
      rotate: () => stepRotateText.textContent,
      stack: () => stepStackText.textContent
    };

    function postToParent(payload) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "integral-studio", ...payload }, window.location.origin);
      }
    }

    let lastPostedStep = "";
    let lastProgressPostAt = 0;
    let lastPostedProgress = -1;
    let lastPostedPlaying = null;
    const PROGRESS_POST_MS = 50;
    const PROGRESS_POST_EPS = 0.005;

    function setActiveStep(step) {
      if (step === lastPostedStep) return;
      lastPostedStep = step;
      ["region", "slice", "rotate", "stack"].forEach(name => {
        document.getElementById(`step-${name}`)?.classList.toggle("active", name === step);
      });
      postToParent({
        action: "step",
        step,
        text: stepDetailText[step]?.() || ""
      });
    }

    function postProgress(force = false) {
      const now = performance.now();
      const progressChanged = Math.abs(progress - lastPostedProgress) >= PROGRESS_POST_EPS;
      const playingChanged = playing !== lastPostedPlaying;
      if (!force && !playingChanged && !progressChanged) return;
      if (!force && !playingChanged && now - lastProgressPostAt < PROGRESS_POST_MS) return;
      lastProgressPostAt = now;
      lastPostedProgress = progress;
      lastPostedPlaying = playing;
      postToParent({
        action: "progress",
        progress,
        playing
      });
    }

    function setExample(key) {
      const wasPlaying = playing;
      lastPostedStep = "";
      lastPostedProgress = -1;
      activeExample = normalizeExample(examples[key]);
      // Scale math→world BEFORE any geometry or camera work so tall domains fit.
      configureWorldScale(activeExample);
      exampleTitle.textContent = activeExample.title;
      exampleSubtitle.textContent = activeExample.subtitle;
      renderFormula();
      setFormulaVisibility(false);
      sampleLabel.textContent = activeExample.sampleLabel;
      measureLabel.textContent = activeExample.measureLabel;
      const isShell = activeExample.method.startsWith("shell");
      const isCrossSection = activeExample.method.startsWith("cross-");
      const isAreaLike = isAreaStripMethod(activeExample.method);
      const hasCutout = Boolean(activeExample.cutout);
      const piece = isShell
        ? "shell"
        : activeExample.method.startsWith("disk")
          ? "disk"
          : activeExample.method === "arc"
            ? "hypotenuse segment"
            : activeExample.method === "surface-x" || activeExample.method === "surface-y"
              ? "surface band"
              : activeExample.method === "pump-bowl"
                ? "water slice"
                : activeExample.method === "pool-fill"
                  ? "water slice"
                : activeExample.method === "goat-barn"
                  ? "sector"
                : isCrossSection
                  ? "cross-section"
                : isAreaLike
                  ? "strip"
              : "washer";
      const sliceDirection = activeExample.orientation === "vertical" ? "vertical" : "horizontal";
      if (isAreaLike) {
        stepRegionText.textContent =
          activeExample.method === "centroid"
            ? (hasCutout
              ? "Sketch the composite lamina — full shape minus the removed corner (hatched)."
              : "Sketch the lamina (planar region) whose center of mass we seek.")
            : activeExample.method === "inertia"
              ? "Sketch the region and the axis for the second moment."
              : "Sketch the integrand y = f(x) over the interval of integration.";
        stepSliceText.textContent =
          activeExample.method === "centroid" && hasCutout
            ? `Choose a thin ${sliceDirection} strip; height follows the L-profile (shorter under the cutout).`
            : `Choose a thin ${sliceDirection} strip of height f(x) and width dx.`;
        stepRotateText.textContent =
          activeExample.method === "centroid"
            ? (hasCutout
              ? "Each strip contributes area × lever arm; composite parts use keep-minus-remove moments."
              : "Form the moment contribution of one strip (mass × lever arm).")
            : activeExample.method === "inertia"
              ? "Form the second-moment contribution of one strip."
              : "Form one strip area: height × width = f(x) dx.";
        stepStackText.textContent =
          activeExample.method === "centroid"
            ? (hasCutout
              ? "Combine part moments, divide by net area — the balance point appears."
              : "Sum strip moments and divide by total area to locate the centroid.")
            : activeExample.method === "inertia"
              ? "Add strip contributions to accumulate the second moment."
              : "Add many thin strips to accumulate the definite integral (signed area).";
        legendSlice.textContent = `${sliceDirection[0].toUpperCase()}${sliceDirection.slice(1)} strip`;
        legendSolid.textContent =
          activeExample.method === "centroid"
            ? (hasCutout ? "L-region + balance point" : "Accumulated region for balance")
            : activeExample.method === "inertia"
              ? "Accumulated second-moment strips"
              : "Accumulated area strips";
      } else {
        stepRegionText.textContent = "Sketch the bounded region.";
        stepSliceText.textContent = activeExample.method === "arc" ? "Place points along the curve." : activeExample.method === "pump-bowl" ? "Choose a horizontal water slice." : activeExample.method === "pool-fill" ? "Choose a thin slice along the pool length." : activeExample.method === "goat-barn" ? "Start with the main leash sector." : isCrossSection ? "Choose a slice perpendicular to the x-axis." : `Choose a ${sliceDirection} slice.`;
        stepRotateText.textContent = activeExample.method === "arc" ? "Connect consecutive points with hypotenuse segments." : activeExample.method === "surface-x" || activeExample.method === "surface-y" ? "Rotate a slanted segment into a surface band." : activeExample.method === "pump-bowl" ? "Lift one slice to the spout height." : activeExample.method === "pool-fill" ? "Compute width times depth times thickness." : activeExample.method === "goat-barn" ? "Wrap around the barn corners." : isCrossSection ? "Raise the slice into its stated cross-section." : `Rotate the slice into one ${piece}.`;
        stepStackText.textContent = activeExample.method === "arc" ? "Add the hypotenuse lengths to approximate the arc." : activeExample.method === "surface-x" || activeExample.method === "surface-y" ? "Add circumference times slant length for each band." : activeExample.method === "pump-bowl" ? "Sum the work for all water slices." : activeExample.method === "pool-fill" ? "Add all slices to fill the pool." : activeExample.method === "goat-barn" ? "Add the sector areas." : isCrossSection ? "Add the cross-section areas to build the volume." : `Add many thin ${piece}s to make the solid.`;
        legendSlice.textContent = activeExample.method === "arc" ? "Points on the curve" : activeExample.method === "surface-x" || activeExample.method === "surface-y" ? "Slanted curve segment" : activeExample.method === "pump-bowl" ? "Lifted water slice" : activeExample.method === "pool-fill" ? "Lengthwise water slice" : activeExample.method === "goat-barn" ? "Leash reach sector" : isCrossSection ? "Perpendicular cross-section" : `Rotating ${sliceDirection} slice`;
        legendSolid.textContent = activeExample.method === "arc" ? "Connected hypotenuse segments" : activeExample.method === "surface-x" || activeExample.method === "surface-y" ? "Completed surface bands" : activeExample.method === "pump-bowl" ? "Water slices in the bowl" : activeExample.method === "pool-fill" ? "Filled pool volume" : activeExample.method === "goat-barn" ? "Total grazed area" : isCrossSection ? "Completed cross-section volume" : `Completed solid ${piece}s`;
      }
      if (activeExample.method === "goat-barn") {
        root.rotation.y = 0;
        controls.target.set(xToWorld(0), 0, yToWorld(0));
        camera.position.set(xToWorld(0), 12.5, yToWorld(0) + 0.08);
        applyViewLimits(12.5);
      } else if (activeExample.method === "pool-fill") {
        root.rotation.y = -0.18;
        controls.target.set(0, 0.45, 0);
        camera.position.set(4.2, 3.2, 4.4);
        applyViewLimits(6);
      } else {
        fitCameraToExample(activeExample);
      }
      controls.update();
      clearGroup(regionGroup);
      clearGroup(waterFillGroup);
      if (activeExample.method === "pump-bowl") {
        regionGroup.add(makeBowlModel());
        waterFillGroup.add(makeFilledWater(activeExample.yMin, activeExample.yMax, 14));
      } else if (activeExample.method === "pool-fill") {
        regionGroup.add(makePoolModel());
      } else if (activeExample.method === "goat-barn") {
        regionGroup.add(makeGoatBarnBase());
      } else {
        regionGroup.add(makeGrid(activeExample));
        if (activeExample.method !== "arc") {
          regionGroup.add(makeRegion(activeExample));
        }
        regionGroup.add(makeCurve(activeExample));
        regionGroup.add(makeAxes(activeExample));
        if (activeExample.cutout) {
          const ghost = makeCutoutGhost(activeExample.cutout);
          if (ghost) regionGroup.add(ghost);
        }
        if (activeExample.parts) {
          const partGroup = makePartMarkers(activeExample.parts);
          if (partGroup) {
            partGroup.userData.isPartMarkers = true;
            regionGroup.add(partGroup);
          }
        }
        if (activeExample.marker) {
          const centroidPt = makePoint(activeExample.marker.x, activeExample.marker.y, 0xbc9a62, 0.034);
          centroidPt.userData.isCentroidMarker = true;
          centroidPt.scale.setScalar(0.15);
          centroidPt.visible = false;
          regionGroup.add(centroidPt);
        }
      }
      clearGroup(sliceGroup);
      clearGroup(shellGroup);
      clearGroup(completedShells);
      lastCompletedKey = "";
      lastSliceKey = "";
      lastShellKey = "";
      lastRemainingWaterKey = "";
      progress = 0;
      progressInput.value = "0";
      const allowMotion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      playing = allowMotion && wasPlaying;
      playButton.textContent = playing ? "Pause" : "Play";
      previous = performance.now();
      updateScene();
      if (playing) ensureAnimationLoop();
    }

    function intervalInfo(ex) {
      if (ex.orientation === "vertical") {
        return { min: ex.xMin, max: ex.xMax, width: (ex.xMax - ex.xMin) / Number(shellCountInput.value) };
      }
      return { min: ex.yMin, max: ex.yMax, width: (ex.yMax - ex.yMin) / Number(shellCountInput.value) };
    }

    function rebuildCompletedShells(count, reveal) {
      clearGroup(completedShells);
      if (activeExample.method === "pump-bowl") {
        if (reveal <= 0) return;
        const dy = (activeExample.yMax - activeExample.yMin) / count;
        const travel = Math.min(count - 0.001, reveal * count);
        const stripIndex = Math.floor(travel);
        const localLift = travel - stripIndex;
        const y = activeExample.yMax - dy * (stripIndex + 0.5);
        completedShells.add(makePumpSample(y, localLift));
        return;
      }
      if (activeExample.method === "pool-fill") {
        completedShells.add(makePoolFill(count, reveal));
        return;
      }
      if (activeExample.method === "arc") {
        completedShells.add(makeArcApproximation(activeExample, count, reveal));
        return;
      }
      const shown = Math.floor(count * reveal);
      const ex = activeExample;
      const min = ex.orientation === "vertical" ? ex.xMin : ex.yMin;
      const max = ex.orientation === "vertical" ? ex.xMax : ex.yMax;
      const shellWidth = (max - min) / count;
      for (let i = 0; i < shown; i += 1) {
        const value = min + shellWidth * (i + 0.5);
        let piece;
        if (isAreaStripMethod(ex.method)) {
          piece = makeSlice(ex, value, shellWidth * 0.86, materials.completed);
        } else if (ex.method.startsWith("cross-")) {
          piece = makeCrossSection(ex, value, shellWidth * 0.86, materials.completed, 1);
        } else if (ex.method.startsWith("shell")) {
          piece = makeShell(ex, value, Math.PI * 2, materials.completed, shellWidth);
        } else if (ex.method === "surface-x") {
          piece = makeSurfaceBand(ex, value - shellWidth / 2, value + shellWidth / 2, Math.PI * 2, materials.completed);
          completedShells.add(makeCircumferenceRing(value, ex.top(value), materials.lineAmber, ex.axisY ?? 0));
        } else if (ex.method === "surface-y") {
          piece = makeSurfaceBandY(ex, value - shellWidth / 2, value + shellWidth / 2, Math.PI * 2, materials.completed);
          completedShells.add(makeCircumferenceRingY(ex, value, materials.lineAmber));
        } else {
          piece = makeWasherOrDisk(ex, value, Math.PI * 2, materials.completed, shellWidth);
        }
        completedShells.add(piece);
      }
    }

    function updateScene(readFromSlider = false) {
      if (readFromSlider) {
        progress = Number(progressInput.value);
      }
      const ex = activeExample;
      const shellCount = Number(shellCountInput.value);
      const interval = intervalInfo(ex);
      const sampleValue = ex.method === "pump-bowl"
        ? interval.max - (interval.max - interval.min) * 0.12
        : interval.min + (interval.max - interval.min) * 0.56;
      const sampleWidth = interval.width;

      const slicePhase = Math.min(1, Math.max(0, progress / 0.28));
      const rotatePhase = Math.min(1, Math.max(0, (progress - 0.24) / 0.42));
      const stackPhase = Math.min(1, Math.max(0, (progress - 0.72) / 0.28));
      const shellAngle = 0.02 + rotatePhase * Math.PI * 2;

      if (ex.method === "pump-bowl") {
        const remainingTop = interval.max - (interval.max - interval.min) * stackPhase;
        const waterKey = `${exampleInput.value}:${remainingTop.toFixed(2)}:${shellCount}`;
        if (waterKey !== lastRemainingWaterKey) {
          clearGroup(waterFillGroup);
          if (remainingTop > interval.min + 0.01) {
            waterFillGroup.add(makeFilledWater(interval.min, remainingTop, Math.max(2, Math.ceil(shellCount * (remainingTop - interval.min) / (interval.max - interval.min)))));
          }
          lastRemainingWaterKey = waterKey;
        }
      }

      if (ex.method === "goat-barn") {
        const stage = progress < 0.43 ? 1 : progress < 0.72 ? 2 : 3;
        const goatKey = `${exampleInput.value}:${stage}:${Math.floor(progress * 50)}`;
      if (goatKey !== lastCompletedKey) {
        clearGroup(sliceGroup);
        clearGroup(shellGroup);
        clearGroup(completedShells);
        completedShells.add(makeGoatGrazing(progress));
        shellGroup.add(makeGoatActor(progress));
        lastCompletedKey = goatKey;
      }
        setActiveStep(progress < 0.24 ? "region" : progress < 0.43 ? "slice" : progress < 0.72 ? "rotate" : "stack");
        xReadout.textContent = String(stage);
        const area = stage === 1 ? 75 * Math.PI : stage === 2 ? 79 * Math.PI : 88 * Math.PI;
        hReadout.textContent = area.toFixed(1);
        controls.update();
        return;
      }

      if (ex.method === "pool-fill") {
        const poolKey = `${exampleInput.value}:${shellCount}:${stackPhase.toFixed(2)}:${progress < 0.70 ? rotatePhase.toFixed(2) : "done"}`;
        if (poolKey !== lastCompletedKey) {
          clearGroup(sliceGroup);
          clearGroup(shellGroup);
          clearGroup(completedShells);
          if (progress < 0.58) {
            sliceGroup.add(makePoolSample(sampleValue, sampleWidth * (0.2 + slicePhase * 0.8)));
          }
          if (progress >= 0.20 && progress < 0.70) {
            shellGroup.add(makePoolSample(sampleValue, sampleWidth * (0.4 + rotatePhase * 0.6)));
          }
          if (progress >= 0.68) {
            completedShells.add(makePoolFill(shellCount, stackPhase));
          }
          lastCompletedKey = poolKey;
        }
        if (progress < 0.24) setActiveStep("region");
        else if (progress < 0.43) setActiveStep("slice");
        else if (progress < 0.72) setActiveStep("rotate");
        else setActiveStep("stack");
        const currentX = 20 * clamp01(stackPhase || 0.56);
        const dx = 20 / shellCount;
        const depth = poolDepth(currentX);
        const sliceVolume = 8 * depth * dx;
        xReadout.textContent = currentX.toFixed(2);
        hReadout.textContent = progress >= 0.96 ? "640 s" : sliceVolume.toFixed(1);
        controls.update();
        return;
      }

      const sliceKey = progress < 0.52 && ex.method !== "arc"
        ? `${exampleInput.value}:${sampleValue.toFixed(3)}:${sampleWidth.toFixed(3)}:${slicePhase.toFixed(2)}:${rotatePhase.toFixed(2)}`
        : "none";
      if (sliceKey !== lastSliceKey) {
        clearGroup(sliceGroup);
        if (ex.method === "pump-bowl" && progress < 0.52) {
          const y = sampleValue;
          sliceGroup.add(makeWaterDisk(y, sampleWidth * 0.82, materials.water));
        } else if (progress < 0.52 && ex.method !== "arc") {
          slice = makeSlice(ex, sampleValue, sampleWidth * 0.82);
          slice.position.z = 0.014 + rotatePhase * 0.025;
          slice.scale.y = ex.orientation === "vertical" ? 0.08 + slicePhase * 0.92 : 1;
          slice.scale.x = ex.orientation === "horizontal" ? 0.08 + slicePhase * 0.92 : 1;
          sliceGroup.add(slice);
        }
        lastSliceKey = sliceKey;
      }

      const shellAngleStep = Math.floor(shellAngle / (Math.PI / 18));
      const shellKey = progress >= 0.20 && progress < 0.70
        ? `${exampleInput.value}:${sampleValue.toFixed(3)}:${sampleWidth.toFixed(3)}:${shellAngleStep}`
        : "none";
      if (shellKey !== lastShellKey) {
        clearGroup(shellGroup);
        if (progress >= 0.20 && progress < 0.70) {
          if (ex.method === "pump-bowl") {
            shellGroup.add(makePumpSample(sampleValue, rotatePhase));
          } else if (ex.method === "arc") {
            shellGroup.add(makeArcApproximation(ex, Math.max(3, Math.floor(shellCount * rotatePhase)), 1));
          } else if (ex.method === "surface-x") {
            shellGroup.add(makeSurfaceBand(ex, sampleValue - sampleWidth / 2, sampleValue + sampleWidth / 2, shellAngle, materials.shell));
            shellGroup.add(makeCircumferenceRing(sampleValue, ex.top(sampleValue), materials.lineAmber, ex.axisY ?? 0));
          } else if (ex.method === "surface-y") {
            shellGroup.add(makeSurfaceBandY(ex, sampleValue - sampleWidth / 2, sampleValue + sampleWidth / 2, shellAngle, materials.shell));
            shellGroup.add(makeCircumferenceRingY(ex, sampleValue, materials.lineAmber));
          } else if (ex.method.startsWith("cross-")) {
            shellGroup.add(makeCrossSection(ex, sampleValue, sampleWidth * 0.82, materials.shell, rotatePhase));
          } else if (isAreaStripMethod(ex.method)) {
            shellGroup.add(makeSlice(ex, sampleValue, sampleWidth * 0.82, materials.shell));
            // Centroid moment phase: draw lever arm from strip center to the y-axis (x=0).
            if (ex.method === "centroid" && ex.orientation === "vertical") {
              const vb = verticalBounds(ex, sampleValue);
              const midY = (vb.lower + vb.upper) / 2;
              shellGroup.add(makeLine([
                new THREE.Vector3(xToWorld(0), yToWorld(midY), 0.05),
                new THREE.Vector3(xToWorld(sampleValue), yToWorld(midY), 0.05)
              ], materials.lineAmber));
              shellGroup.add(makePoint(sampleValue, midY, 0xbc9a62, 0.016));
            }
          } else {
            const piece = ex.method.startsWith("shell")
              ? makeShell(ex, sampleValue, shellAngle, materials.shell, sampleWidth * 0.82)
              : makeWasherOrDisk(ex, sampleValue, shellAngle, materials.shell, sampleWidth * 0.82);
            shellGroup.add(piece);
          }
          if (ex.method.startsWith("shell")) {
            shellGroup.add(makeShellRim(ex, sampleValue, shellAngle, materials.lineAmber));
          }
        }
        lastShellKey = shellKey;
      }

      const shownCount = Math.floor(shellCount * stackPhase);
      const completedKey = ex.method === "pump-bowl"
        ? `${exampleInput.value}:${shellCount}:${stackPhase.toFixed(2)}`
        : `${exampleInput.value}:${shellCount}:${shownCount}`;
      if (completedKey !== lastCompletedKey) {
        rebuildCompletedShells(shellCount, stackPhase);
        lastCompletedKey = completedKey;
      }
      const regionMesh = regionGroup.children.find(child => child.material === materials.region);
      if (regionMesh?.material) {
        regionMesh.material.opacity = progress > 0.74 ? 0.2 : 0.55;
      }

      // Composite cutout: bright at region stage, fade as strips accumulate.
      const cutoutGhost = regionGroup.children.find(child => child.name === "cutoutGhost");
      if (cutoutGhost) {
        const ghostOpacity = progress < 0.28
          ? 1
          : progress < 0.72
            ? 1 - (progress - 0.28) / 0.44 * 0.55
            : 0.35;
        cutoutGhost.traverse(child => {
          if (child.material && "opacity" in child.material) {
            // outline lines stay more visible than fill
            const isFill = child.isMesh && child.geometry?.type === "ShapeGeometry";
            child.material.transparent = true;
            child.material.opacity = isFill
              ? 0.14 * ghostOpacity
              : Math.min(1, 0.55 + 0.45 * ghostOpacity);
          }
        });
        cutoutGhost.visible = progress < 0.92;
      }

      // Part markers (A1 keep / A2 remove): show early, fade once balance appears.
      const partMarkers = regionGroup.children.find(child => child.userData?.isPartMarkers);
      if (partMarkers) {
        const showParts = progress < 0.78;
        partMarkers.visible = showParts;
        const s = progress < 0.2 ? 0.4 + progress * 3 : 1;
        partMarkers.scale.setScalar(Math.min(1, s));
      }

      // Centroid marker: grow in during the balance/stack phase.
      const centroidMarker = regionGroup.children.find(child => child.userData?.isCentroidMarker);
      if (centroidMarker) {
        if (ex.method === "centroid" || ex.marker) {
          const reveal = Math.min(1, Math.max(0, (progress - 0.72) / 0.22));
          centroidMarker.visible = reveal > 0.02;
          const pulse = 1 + 0.08 * Math.sin(performance.now() * 0.006);
          centroidMarker.scale.setScalar((0.2 + 0.8 * reveal) * pulse);
          if (centroidMarker.material && "opacity" in centroidMarker.material) {
            centroidMarker.material.transparent = true;
            centroidMarker.material.opacity = 0.35 + 0.65 * reveal;
          }
        } else {
          centroidMarker.visible = true;
          centroidMarker.scale.setScalar(1);
        }
      }

      if (progress < 0.24) setActiveStep("region");
      else if (progress < 0.43) setActiveStep("slice");
      else if (progress < 0.72) setActiveStep("rotate");
      else setActiveStep("stack");

      let currentValue = interval.min + (interval.max - interval.min) * clamp01(stackPhase || 0.56);
      if (ex.method === "pump-bowl") {
        const dy = (interval.max - interval.min) / shellCount;
        const travel = Math.min(shellCount - 0.001, clamp01(stackPhase) * shellCount);
        const stripIndex = Math.floor(travel);
        currentValue = interval.max - dy * (stripIndex + 0.5);
      }
      xReadout.textContent = currentValue.toFixed(2);
      let measure = 0;
      if (ex.method === "pump-bowl") {
        measure = 8 - currentValue;
      } else if (ex.method === "arc" || ex.method === "surface-x") {
        const dx = (ex.xMax - ex.xMin) / shellCount;
        const y0 = ex.top(currentValue);
        const y1 = ex.top(Math.min(ex.xMax, currentValue + dx));
        measure = Math.hypot(dx, y1 - y0);
      } else if (ex.method === "surface-y") {
        if (ex.orientation === "horizontal") {
          const dy = (ex.yMax - ex.yMin) / shellCount;
          const x0 = horizontalBounds(ex, currentValue).right;
          const x1 = horizontalBounds(ex, Math.min(ex.yMax, currentValue + dy)).right;
          measure = Math.hypot(dy, x1 - x0);
        } else {
          const dx = (ex.xMax - ex.xMin) / shellCount;
          const y0 = ex.top(currentValue);
          const y1 = ex.top(Math.min(ex.xMax, currentValue + dx));
          measure = Math.hypot(dx, y1 - y0);
        }
      } else if (ex.method.startsWith("cross-")) {
        const vb = verticalBounds(ex, currentValue);
        measure = vb.upper - vb.lower;
      } else if (ex.orientation === "vertical") {
        const vb = verticalBounds(ex, currentValue);
        if (ex.method.startsWith("disk") || ex.method.startsWith("washer")) {
          // Disk/washer measure = outer radius from the axis of revolution.
          measure = Math.max(
            Math.abs((ex.axisY ?? 0) - vb.lower),
            Math.abs((ex.axisY ?? 0) - vb.upper)
          );
        } else if (ex.method.startsWith("shell")) {
          measure = vb.upper - vb.lower;
        } else {
          measure = vb.upper - vb.lower;
        }
      } else {
        const hb = horizontalBounds(ex, currentValue);
        if (ex.method.startsWith("disk") || ex.method.startsWith("washer")) {
          measure = Math.max(
            Math.abs((ex.axisX ?? 0) - hb.left),
            Math.abs((ex.axisX ?? 0) - hb.right)
          );
        } else if (ex.method.startsWith("shell")) {
          measure = hb.right - hb.left;
        } else {
          measure = hb.right - hb.left;
        }
      }
      hReadout.textContent = measure.toFixed(2);
    }

    function resize() {
      const width = renderer.domElement.clientWidth;
      const height = renderer.domElement.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function renderScene() {
      controls.update();
      renderer.render(scene, camera);
    }

    function ensureAnimationLoop() {
      if (animationFrame || !playing || !sceneVisible || document.hidden) return;
      previous = performance.now();
      animationFrame = requestAnimationFrame(animate);
    }

    function animate(now) {
      animationFrame = 0;
      if (!playing || !sceneVisible || document.hidden) return;
      const dt = Math.min(48, now - previous);
      previous = now;

      progress += dt * 0.00011 * playbackSpeed();
      if (progress > 1) {
        if (playbackModeInput.value === "once") {
          progress = 1;
          playing = false;
          playButton.textContent = "Play";
        } else {
          progress = 0;
        }
      }
      progressInput.value = progress.toFixed(3);
      postProgress();

      updateScene();
      renderScene();
      ensureAnimationLoop();
    }

    progressInput.addEventListener("input", () => {
      progress = Number(progressInput.value);
      playing = false;
      playButton.textContent = "Play";
      updateScene(true);
      renderScene();
    });

    toggleFormulaButton.addEventListener("click", () => {
      setFormulaVisibility(!formulaVisible);
    });

    exampleInput.addEventListener("change", () => {
      setExample(exampleInput.value);
    });

    playbackModeInput.addEventListener("change", () => {
      if (!playing && Number(progressInput.value) >= 0.999) {
        playButton.textContent = "Play";
      }
    });

    speedInput.addEventListener("input", () => {
      if (playing) previous = performance.now();
    });

    shellCountInput.addEventListener("input", () => updateScene());

    playButton.addEventListener("click", () => {
      if (playing) {
        playing = false;
        playButton.textContent = "Play";
      } else {
        startPlayback();
      }
    });

    resetButton.addEventListener("click", () => {
      progress = 0;
      progressInput.value = "0";
      playing = false;
      playButton.textContent = "Play";
      updateScene();
      renderScene();
    });


    function resetCameraView() {
      if (activeExample.method === "goat-barn") {
        root.rotation.y = 0;
        controls.target.set(xToWorld(0), 0, yToWorld(0));
        camera.position.set(xToWorld(0), 12.5, yToWorld(0) + 0.08);
        applyViewLimits(12.5);
      } else if (activeExample.method === "pool-fill") {
        root.rotation.y = -0.18;
        controls.target.set(0, 0.45, 0);
        camera.position.set(4.2, 3.2, 4.4);
        applyViewLimits(6);
      } else {
        fitCameraToExample(activeExample);
      }
      controls.update();
      renderScene();
    }

    function handleCameraKeys(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;

      const orbit = 0.09;
      const zoomIn = 0.92;
      const zoomOut = 1.09;
      const up = new THREE.Vector3(0, 1, 0);
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      let handled = true;

      switch (event.key) {
        case "ArrowLeft":
          offset.applyAxisAngle(up, orbit);
          camera.position.copy(controls.target).add(offset);
          break;
        case "ArrowRight":
          offset.applyAxisAngle(up, -orbit);
          camera.position.copy(controls.target).add(offset);
          break;
        case "ArrowUp": {
          const right = new THREE.Vector3().crossVectors(offset, up).normalize();
          const polar = new THREE.Quaternion().setFromAxisAngle(right, -orbit);
          offset.applyQuaternion(polar);
          camera.position.copy(controls.target).add(offset);
          break;
        }
        case "ArrowDown": {
          const right = new THREE.Vector3().crossVectors(offset, up).normalize();
          const polar = new THREE.Quaternion().setFromAxisAngle(right, orbit);
          offset.applyQuaternion(polar);
          camera.position.copy(controls.target).add(offset);
          break;
        }
        case "+":
        case "=":
          camera.position.lerp(controls.target, 1 - zoomIn);
          break;
        case "-":
        case "_": {
          const away = offset.multiplyScalar(zoomOut);
          camera.position.copy(controls.target).add(away);
          break;
        }
        case "r":
        case "R":
          resetCameraView();
          return;
        default:
          handled = false;
      }

      if (!handled) return;
      event.preventDefault();
      const distance = camera.position.distanceTo(controls.target);
      if (distance < controls.minDistance || distance > controls.maxDistance) {
        offset.copy(camera.position).sub(controls.target).setLength(
          Math.min(controls.maxDistance, Math.max(controls.minDistance, distance))
        );
        camera.position.copy(controls.target).add(offset);
      }
      controls.update();
      renderScene();
    }

    window.addEventListener("message", event => {
      // Only accept control messages from same-origin parents (CEE 103 shell).
      if (event.origin !== window.location.origin) return;
      if (window.parent !== window && event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.type !== "integral-studio") return;
      switch (data.action) {
        case "setShells": {
          const value = Math.max(4, Math.min(48, Number(data.value) || 14));
          shellCountInput.value = String(value);
          updateScene();
          renderScene();
          break;
        }
        case "setSpeed": {
          const value = Math.max(0.25, Math.min(3, Number(data.value) || 1));
          speedInput.value = String(value);
          if (playing) previous = performance.now();
          break;
        }
        case "setProgress": {
          progress = Math.max(0, Math.min(1, Number(data.value) || 0));
          progressInput.value = progress.toFixed(3);
          playing = false;
          playButton.textContent = "Play";
          updateScene(true);
          renderScene();
          postProgress(true);
          break;
        }
        case "play": {
          startPlayback();
          postProgress(true);
          break;
        }
        case "pause": {
          playing = false;
          playButton.textContent = "Play";
          postProgress(true);
          break;
        }
        case "togglePlay": {
          if (playing) {
            playing = false;
            playButton.textContent = "Play";
          } else {
            startPlayback();
          }
          postProgress(true);
          break;
        }
        case "resetView": {
          resetCameraView();
          break;
        }
        case "resetPlayback": {
          progress = 0;
          progressInput.value = "0";
          playing = false;
          playButton.textContent = "Play";
          lastPostedStep = "";
          updateScene();
          renderScene();
          postProgress(true);
          break;
        }
        case "getState": {
          event.source?.postMessage({
            type: "integral-studio",
            action: "state",
            progress,
            playing,
            speed: Number(speedInput.value),
            shells: Number(shellCountInput.value)
          }, event.origin);
          break;
        }
        case "setExample": {
          if (applyDynamicSpec(data.spec)) {
            exampleInput.value = "dynamic";
            lastPostedStep = "";
            setExample("dynamic");
            postProgress(true);
          }
          break;
        }
        case "setPalette": {
          applyPalette(data.palette);
          break;
        }
        default:
          break;
      }
    });

    window.addEventListener("keydown", handleCameraKeys);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) ensureAnimationLoop();
    });
    const visibilityObserver = new IntersectionObserver(entries => {
      sceneVisible = entries[0]?.isIntersecting ?? true;
      if (sceneVisible) ensureAnimationLoop();
    }, { threshold: 0.01 });
    visibilityObserver.observe(renderer.domElement);
    if (typeof ResizeObserver !== "undefined") {
      const sizeObserver = new ResizeObserver(() => resize());
      sizeObserver.observe(renderer.domElement);
    }
    controls.addEventListener("change", () => renderer.render(scene, camera));
    resize();
    if (paletteFromQuery) applyPalette(paletteFromQuery);
    setExample(exampleInput.value);
    updateScene();
    renderScene();
    postToParent({ action: "ready" });
    postProgress(true);
    ensureAnimationLoop();
