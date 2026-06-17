// PURE module — no React, no canvas, no DOM. Unit-testable affine transform math.
//
// Wave 3a (Transform Gizmo): mirrors the proven stroke/{stabilizer,pressure,
// pressureCurve}.ts pattern — pure data->data functions, co-located *.test.ts,
// zero side effects, never mutates its inputs.
//
// MATRIX LAYOUT
// =============
// `Mat2D` is the canvas 6-tuple `[a, b, c, d, e, f]` consumed verbatim by
// `ctx.setTransform(a, b, c, d, e, f)`:
//
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
//
// equivalent to the 3x3 affine matrix
//
//   | a  c  e |
//   | b  d  f |
//   | 0  0  1 |
//
// Using the canvas 6-tuple (NOT a generic 3x3) keeps the gizmo preview path one
// call away from `overlayCtx.setTransform(...m)` — no translation layer between
// the math and the canvas API.
//
// SCOPE: affine only (translate / scale / rotate / shear-free composition).
// Perspective / warp (homography) is EXPLICITLY OUT OF SCOPE for Wave 3a and is
// documented as the top follow-up — see fitHandleDrag.

export type Mat2D = readonly [
  number, // a
  number, // b
  number, // c
  number, // d
  number, // e
  number, // f
];

export interface Vec2 {
  x: number;
  y: number;
}

/** The identity transform — applyToPoint(identity(), p) returns p unchanged. */
export function identity(): Mat2D {
  return [1, 0, 0, 1, 0, 0];
}

/**
 * Compose two matrices in CANVAS ORDER: the result applies `m2` FIRST, then `m1`.
 *
 * That is, `multiply(m1, m2)` is the matrix product `m1 * m2`, so:
 *
 *   applyToPoint(multiply(m1, m2), p) === applyToPoint(m1, applyToPoint(m2, p))
 *
 * Compose-order is the #1 affine pitfall, so this is asserted explicitly in the
 * tests. Read `multiply(A, B)` as "do B, then A".
 */
export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Apply a matrix to a point, returning a NEW point (never mutates `p`). */
export function applyToPoint(m: Mat2D, p: Vec2): Vec2 {
  const [a, b, c, d, e, f] = m;
  return {
    x: a * p.x + c * p.y + e,
    y: b * p.x + d * p.y + f,
  };
}

/**
 * Invert a matrix. Returns `null` when the determinant is ~0 (a degenerate
 * scale-to-zero matrix has no inverse). Callers treat `null` as "no preview /
 * refuse commit".
 */
export function invert(m: Mat2D): Mat2D | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * f - d * e) * invDet,
    (b * e - a * f) * invDet,
  ];
}

/** A pure translation by (tx, ty). */
export function translate(tx: number, ty: number): Mat2D {
  return [1, 0, 0, 1, tx, ty];
}

/** A pure scale by (sx, sy) about the origin. */
export function scale(sx: number, sy: number): Mat2D {
  return [sx, 0, 0, sy, 0, 0];
}

/** A pure rotation by `rad` radians about the origin. */
export function rotate(rad: number): Mat2D {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

/**
 * Scale by (sx, sy) keeping `pivot` fixed.
 *
 *   scaleAbout = translate(pivot) * scale(sx, sy) * translate(-pivot)
 *
 * composed via `multiply` so the pivot point maps to itself.
 */
export function scaleAbout(sx: number, sy: number, pivot: Vec2): Mat2D {
  return multiply(
    translate(pivot.x, pivot.y),
    multiply(scale(sx, sy), translate(-pivot.x, -pivot.y)),
  );
}

/**
 * Rotate by `rad` radians keeping `pivot` fixed.
 *
 *   rotateAbout = translate(pivot) * rotate(rad) * translate(-pivot)
 */
export function rotateAbout(rad: number, pivot: Vec2): Mat2D {
  return multiply(
    translate(pivot.x, pivot.y),
    multiply(rotate(rad), translate(-pivot.x, -pivot.y)),
  );
}

export interface Decomposed {
  translation: Vec2;
  rotation: number; // radians
  scale: Vec2;
}

/**
 * Decompose a matrix into translation, rotation (radians), and scale. Used by
 * the gizmo for handle placement / rotation readout. Assumes a shear-free
 * affine (which every transform this module produces is). Cheap and testable.
 */
export function decompose(m: Mat2D): Decomposed {
  const [a, b, c, d, e, f] = m;
  const scaleX = Math.hypot(a, b);
  // det sign recovers a mirrored Y scale (kept for completeness; the gizmo never
  // produces a mirror in 3a).
  const det = a * d - b * c;
  const scaleY = scaleX === 0 ? 0 : det / scaleX;
  const rotation = Math.atan2(b, a);
  return {
    translation: { x: e, y: f },
    rotation,
    scale: { x: scaleX, y: scaleY },
  };
}

export type HandleId =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "rotate";

export interface AxisAlignedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitHandleDragOpts {
  /** Matrix at the moment the drag started (usually identity for a fresh edit). */
  base: Mat2D;
  /** Which handle is being dragged. */
  handle: HandleId;
  /** Logical (camera-un-projected) bbox of the target at drag start. */
  startBox: AxisAlignedBox;
  /** Current pointer position in LOGICAL canvas coords (camera already removed). */
  pointerLogical: Vec2;
  /** Constrain scale handles to a uniform ratio (dominant axis wins). */
  aspectLock?: boolean;
  /** Pivot for rotation; defaults to the box center in logical coords. */
  rotatePivot?: Vec2;
}

// Internal: the opposite anchor (pivot) for each scale handle, plus which axes
// that handle is allowed to scale. The pivot is the corner/edge that must stay
// FIXED while the dragged handle follows the pointer.
function boxCorners(box: AxisAlignedBox) {
  return {
    nw: { x: box.x, y: box.y },
    n: { x: box.x + box.w / 2, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    e: { x: box.x + box.w, y: box.y + box.h / 2 },
    se: { x: box.x + box.w, y: box.y + box.h },
    s: { x: box.x + box.w / 2, y: box.y + box.h },
    sw: { x: box.x, y: box.y + box.h },
    w: { x: box.x, y: box.y + box.h / 2 },
    center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
  };
}

// For a scale handle: { pivot, scaleX, scaleY } where scaleX/scaleY flag which
// axes the handle drives. The pivot is the opposite corner/edge.
function scaleSpec(handle: Exclude<HandleId, "rotate">, box: AxisAlignedBox) {
  const c = boxCorners(box);
  switch (handle) {
    case "nw":
      return { pivot: c.se, scaleX: true, scaleY: true };
    case "ne":
      return { pivot: c.sw, scaleX: true, scaleY: true };
    case "se":
      return { pivot: c.nw, scaleX: true, scaleY: true };
    case "sw":
      return { pivot: c.ne, scaleX: true, scaleY: true };
    case "n":
      return { pivot: c.s, scaleX: false, scaleY: true };
    case "s":
      return { pivot: c.n, scaleX: false, scaleY: true };
    case "e":
      return { pivot: c.w, scaleX: true, scaleY: false };
    case "w":
      return { pivot: c.e, scaleX: true, scaleY: false };
  }
}

/**
 * Turn a handle drag into a transform matrix, composed onto `base`. PURE — the
 * caller un-projects the camera and passes LOGICAL pointer coords, so this is
 * fully deterministic and DOM-free.
 *
 * Scale handles: the dragged corner/edge follows `pointerLogical` while the
 * OPPOSITE corner/edge (the pivot) stays fixed. `aspectLock` forces a uniform
 * ratio using the dominant axis. The dragged handle's logical start position is
 * the corner of `startBox`, so the new scale factor = (pointer - pivot) /
 * (startHandle - pivot) per active axis.
 *
 * Rotate handle: returns rotateAbout(deltaAngle, pivot) where deltaAngle is the
 * angle swept from the rotate handle's start position to the pointer about the
 * pivot (box center by default).
 *
 * FOLLOW-UP (out of scope for 3a): perspective / homography warp would require a
 * 3x3 projective matrix and a 4-point fit — explicitly deferred to a later wave.
 */
export function fitHandleDrag(opts: FitHandleDragOpts): Mat2D {
  const { base, handle, startBox, pointerLogical, aspectLock } = opts;
  const corners = boxCorners(startBox);

  if (handle === "rotate") {
    // The effective pivot and reference angle must be derived from the
    // base-transformed box corners so that a rotate following a scale pivots
    // around the visible center of the already-scaled content, not the original
    // pre-scale center. When base is identity the two are identical.
    const pivot =
      opts.rotatePivot ?? applyToPoint(base, corners.center);
    // Use the base-transformed 'n' midpoint as the start reference direction
    // (straight up from the transformed center).
    const startHandle = applyToPoint(base, corners.n);
    const a0 = Math.atan2(startHandle.y - pivot.y, startHandle.x - pivot.x);
    const a1 = Math.atan2(
      pointerLogical.y - pivot.y,
      pointerLogical.x - pivot.x,
    );
    return multiply(rotateAbout(a1 - a0, pivot), base);
  }

  const spec = scaleSpec(handle, startBox);
  const { pivot: pivotStart, scaleX: doX, scaleY: doY } = spec;
  const startHandleStart = corners[handle];

  // Transform the pivot and drag-start handle into CURRENT (base-transformed)
  // space. When base is identity these are identical to the startBox coords.
  // This is required for compound transforms: the invariant is that the anchor
  // corner's CURRENT screen position does not move during the drag, so both the
  // pivot and the reference handle must be measured in the same space as the
  // incoming pointerLogical.
  const pivot = applyToPoint(base, pivotStart);
  const startHandle = applyToPoint(base, startHandleStart);

  // Per-axis scale factor: how far the pointer moved from the pivot relative to
  // how far the (base-transformed) handle started from the pivot.
  // Guard zero spans (edge handles or degenerate base).
  const spanX = startHandle.x - pivot.x;
  const spanY = startHandle.y - pivot.y;

  let sx = doX && spanX !== 0 ? (pointerLogical.x - pivot.x) / spanX : 1;
  let sy = doY && spanY !== 0 ? (pointerLogical.y - pivot.y) / spanY : 1;

  if (aspectLock) {
    // Dominant axis: the one with the larger absolute factor drives both. For an
    // edge handle (only one active axis) the inactive factor is 1, so the active
    // one always dominates and is mirrored onto the other axis.
    if (doX && doY) {
      const dom = Math.abs(sx) >= Math.abs(sy) ? sx : sy;
      sx = dom;
      sy = dom;
    } else if (doX) {
      sy = sx;
    } else if (doY) {
      sx = sy;
    }
  }

  // Build scaleAbout in current (base-transformed) space, then compose with base.
  // scaleAbout(sx, sy, pivot) keeps `pivot` (in current space) fixed, which
  // means the anchor corner's transformed position stays invariant.
  return multiply(scaleAbout(sx, sy, pivot), base);
}
