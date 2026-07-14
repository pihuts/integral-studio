/**
 * Scene family adapters — geometry dispatch behind stackPieceKind / methodFamily.
 *
 * Kernel supplies helpers (makeShell, makeSlice, …); adapters own family paint rules.
 * Two+ adapters justify the seam: shell vs disk-washer vs applications, etc.
 */

/**
 * @typedef {object} StackHelpers
 * @property {(ex, value, width, mat) => object} makeSlice
 * @property {(ex, value, width, mat, reveal) => object} makeCrossSection
 * @property {(ex, value, angle, mat, thickness) => object} makeShell
 * @property {(ex, value, angle, mat, thickness) => object} makeWasherOrDisk
 * @property {(ex, x0, x1, angle, mat) => object} makeSurfaceBand
 * @property {(ex, v0, v1, angle, mat) => object} makeSurfaceBandY
 * @property {(x, radius, mat, axisY) => object} makeCircumferenceRing
 * @property {(ex, value, mat) => object} makeCircumferenceRingY
 * @property {(ex, count, reveal) => object} makeArcApproximation
 * @property {(y, progress) => object} makePumpSample
 * @property {(count, reveal) => object} makePoolFill
 * @property {(group, piece) => void} add
 */

/**
 * Rebuild the completed stack for a render-method piece kind.
 * @param {string} kind — from stackPieceKind(method)
 * @param {object} ex — compiled example
 * @param {number} count
 * @param {number} reveal — 0..1 stack phase
 * @param {StackHelpers} h
 * @param {object} materials — { completed, lineAmber, … }
 */
export function rebuildCompletedStack(kind, ex, count, reveal, h, materials) {
  if (kind === "pump-bowl") {
    if (reveal <= 0) return;
    const dy = (ex.yMax - ex.yMin) / count;
    const travel = Math.min(count - 0.001, reveal * count);
    const stripIndex = Math.floor(travel);
    const localLift = travel - stripIndex;
    const y = ex.yMax - dy * (stripIndex + 0.5);
    h.add(null, h.makePumpSample(y, localLift));
    return;
  }
  if (kind === "pool-fill") {
    h.add(null, h.makePoolFill(count, reveal));
    return;
  }
  if (kind === "arc") {
    h.add(null, h.makeArcApproximation(ex, count, reveal));
    return;
  }

  const shown = Math.floor(count * reveal);
  const min = ex.orientation === "vertical" ? ex.xMin : ex.yMin;
  const max = ex.orientation === "vertical" ? ex.xMax : ex.yMax;
  const shellWidth = (max - min) / count;
  const stackThickness = shellWidth * 1.02;

  for (let i = 0; i < shown; i += 1) {
    const value = min + shellWidth * (i + 0.5);
    let piece;
    if (kind === "slice") {
      piece = h.makeSlice(ex, value, shellWidth * 0.86, materials.completed);
    } else if (kind === "cross") {
      piece = h.makeCrossSection(ex, value, shellWidth * 0.86, materials.completed, 1);
    } else if (kind === "shell") {
      piece = h.makeShell(ex, value, Math.PI * 2, materials.completed, stackThickness);
    } else if (kind === "surface-x") {
      piece = h.makeSurfaceBand(
        ex,
        value - shellWidth / 2,
        value + shellWidth / 2,
        Math.PI * 2,
        materials.completed
      );
      h.add(null, h.makeCircumferenceRing(value, ex.top(value), materials.lineAmber, ex.axisY ?? 0));
    } else if (kind === "surface-y") {
      piece = h.makeSurfaceBandY(
        ex,
        value - shellWidth / 2,
        value + shellWidth / 2,
        Math.PI * 2,
        materials.completed
      );
      h.add(null, h.makeCircumferenceRingY(ex, value, materials.lineAmber));
    } else {
      piece = h.makeWasherOrDisk(ex, value, Math.PI * 2, materials.completed, stackThickness);
    }
    h.add(null, piece);
  }
}

/**
 * Build the rotating sample piece for the mid-animation phase.
 * @returns {object|null} mesh/group to add to shellGroup
 */
export function buildRotateSample(family, kind, ex, sampleValue, sampleWidth, shellAngle, rotatePhase, h, materials) {
  if (family === "pump-bowl") {
    return h.makePumpSample(sampleValue, rotatePhase);
  }
  if (family === "pool-fill") {
    return h.makePoolSample?.(sampleValue, sampleWidth * (0.4 + rotatePhase * 0.6)) ?? null;
  }
  if (kind === "shell") {
    return h.makeShell(ex, sampleValue, shellAngle, materials.shell, sampleWidth);
  }
  if (kind === "surface-x") {
    return h.makeSurfaceBand(
      ex,
      sampleValue - sampleWidth / 2,
      sampleValue + sampleWidth / 2,
      shellAngle,
      materials.shell
    );
  }
  if (kind === "surface-y") {
    return h.makeSurfaceBandY(
      ex,
      sampleValue - sampleWidth / 2,
      sampleValue + sampleWidth / 2,
      shellAngle,
      materials.shell
    );
  }
  if (kind === "cross") {
    return h.makeCrossSection(ex, sampleValue, sampleWidth * 0.86, materials.shell, rotatePhase);
  }
  if (kind === "slice" || family === "area-strip") {
    return h.makeSlice(ex, sampleValue, sampleWidth * 0.82, materials.shell);
  }
  if (kind === "arc") {
    return null;
  }
  return h.makeWasherOrDisk(ex, sampleValue, shellAngle, materials.shell, sampleWidth);
}

/** Family ids that own the full frame (early return from kernel). */
export function isEarlyReturnFamily(family) {
  return family === "goat-barn" || family === "pool-fill";
}
