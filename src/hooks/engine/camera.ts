// src/hooks/engine/camera.ts
// Pure camera math — no React, no DOM, no timers, no fetch.
// Consumed by uiSlice (resetCamera) and StatusBar (zoom buttons).

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Compute a camera that fits the canvas (canvasW × canvasH) inside the screen
 * (screenW × screenH) with a proportional margin, centred. Returns a sane
 * default ({ x: 0, y: 0, zoom: 1 }) if any dimension is not positive so the
 * caller never produces NaN coordinates.
 */
export function fitToView(
  canvasW: number,
  canvasH: number,
  screenW: number,
  screenH: number,
  margin = 0.85,
): Camera {
  if (canvasW <= 0 || canvasH <= 0 || screenW <= 0 || screenH <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const fitZoom = Math.min(
    (screenW * margin) / canvasW,
    (screenH * margin) / canvasH,
  );
  // Clamp the auto-fit zoom so it is neither microscopic nor gigantic.
  const zoom = Math.max(0.1, Math.min(fitZoom, 2.0));
  const x = (screenW - canvasW * zoom) / 2;
  const y = (screenH - canvasH * zoom) / 2;

  return { x, y, zoom };
}

/**
 * Apply a zoom factor anchored at (anchorX, anchorY) in screen space.
 * The anchor pixel stays at the same screen position after the zoom.
 * Guards against a zero/near-zero current zoom so the new position stays finite.
 */
export function zoomAt(
  camera: Camera,
  anchorX: number,
  anchorY: number,
  factor: number,
  minZoom = 0.1,
  maxZoom = 10,
): Camera {
  const safeCurrentZoom = Math.max(camera.zoom, 0.001);
  const newZoom = Math.max(minZoom, Math.min(camera.zoom * factor, maxZoom));

  const dx = anchorX - camera.x;
  const dy = anchorY - camera.y;

  const newX = anchorX - dx * (newZoom / safeCurrentZoom);
  const newY = anchorY - dy * (newZoom / safeCurrentZoom);

  return { x: newX, y: newY, zoom: newZoom };
}
