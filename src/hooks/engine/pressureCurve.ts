// PURE module — no React, no canvas, no DOM. Unit-testable cubic-bezier
// pressure-curve mapper, equivalent to CSS `cubic-bezier(x1, y1, x2, y2)`.
//
// Feature B: maps a resolved pressure value p in [0,1] to a shaped output so
// artists can pick how stylus force translates to stroke weight. The curve runs
// from the implicit endpoint (0,0) to (1,1) with two control points; with
// control X in [0,1] the curve is monotonic in x, so endpoints are exact:
//   bezierX(0)=0 -> y=0  =>  f(0)=0
//   bezierX(1)=1 -> y=1  =>  f(1)=1
//
// `mapPressure(p, 'linear')` is the identity (f(p)=p) within solver epsilon, so
// the default preset produces byte-identical pressure to a curve-free pipeline.

export type PressureCurvePreset = "linear" | "soft" | "hard";

export interface BezierControlPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Preset control-point table.
// - Linear: straight line, identity mapping.
// - Soft:   high early response — output rises fast at low pressure (light
//           touch already gives noticeable width).
// - Hard:   late response — output stays low until high pressure (you must
//           press firmly before the stroke fattens up).
export const PRESSURE_CURVE_PRESETS: Record<
  PressureCurvePreset,
  BezierControlPoints
> = {
  linear: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 },
  soft: { x1: 0.25, y1: 0.65, x2: 0.6, y2: 1.0 },
  hard: { x1: 0.4, y1: 0.0, x2: 0.75, y2: 0.35 },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Cubic bezier component (one axis) given the two control coordinates for that
// axis. Endpoints are fixed at 0 and 1. Expanded Bernstein form.
function bezierAxis(t: number, c1: number, c2: number): number {
  const mt = 1 - t;
  // 3*mt^2*t*c1 + 3*mt*t^2*c2 + t^3   (endpoint p0=0, p3=1)
  return 3 * mt * mt * t * c1 + 3 * mt * t * t * c2 + t * t * t;
}

// Derivative of bezierAxis w.r.t. t (for Newton-Raphson).
function bezierAxisDerivative(t: number, c1: number, c2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * c1 + 6 * mt * t * (c2 - c1) + 3 * t * t * (1 - c2);
}

// Solve for parameter t such that bezierX(t) === x, using Newton-Raphson with a
// bisection fallback. Assumes monotonic X (control X in [0,1]).
function solveTForX(x: number, x1: number, x2: number): number {
  // Newton-Raphson.
  let t = x; // good initial guess for near-identity curves
  for (let i = 0; i < 8; i++) {
    const xEst = bezierAxis(t, x1, x2) - x;
    if (Math.abs(xEst) < 1e-7) return t;
    const d = bezierAxisDerivative(t, x1, x2);
    if (Math.abs(d) < 1e-7) break; // derivative too small; fall back to bisection
    t -= xEst / d;
  }

  // Bisection fallback on [0,1] (X is monotonic there).
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 30; i++) {
    const xEst = bezierAxis(t, x1, x2);
    if (Math.abs(xEst - x) < 1e-7) return t;
    if (xEst < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

/**
 * Map a resolved pressure p in [0,1] through a cubic-bezier easing curve.
 * Input is clamped to [0,1]; output is clamped to [0,1].
 *
 * Apply this AFTER resolvePressure so the curve shapes how real pen force maps
 * to stroke width. The "linear" preset is the identity, so the default pipeline
 * is unchanged.
 *
 * @param p resolved pressure
 * @param preset named preset (used when `custom` is not provided)
 * @param custom optional explicit control points (overrides the preset)
 */
export function mapPressure(
  p: number,
  preset: PressureCurvePreset,
  custom?: BezierControlPoints,
): number {
  const cp = custom ?? PRESSURE_CURVE_PRESETS[preset];
  const x = clamp01(p);

  // Fast path / exact endpoints.
  if (x === 0) return 0;
  if (x === 1) return 1;
  // Linear preset is the identity — skip the solver entirely.
  if (preset === "linear" && !custom) return x;

  const t = solveTForX(x, cp.x1, cp.x2);
  return clamp01(bezierAxis(t, cp.y1, cp.y2));
}
