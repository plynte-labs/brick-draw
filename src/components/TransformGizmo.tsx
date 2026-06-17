// src/components/TransformGizmo.tsx
//
// FEATURE D (Transform Gizmo): a NON-DESTRUCTIVE transform tool rendered as a
// DOM overlay INSIDE DrawingCanvas's container. It draws a bounding box + 8
// scale handles + 1 rotate handle as absolutely-positioned DOM elements, plus a
// live preview on a dedicated overlay <canvas>. The Rust layer and the React
// layer.buffer are NEVER touched during interaction — that is what makes Esc /
// cancel provably safe. Commit (Enter) bakes the result through the EXACT
// ImportImageButton path (cargarPngEnCapa), which is non-undoable today (same as
// image/AI import).
//
// ADAPTED FOR THIS BRANCH (vs. the wave3 reference):
//   - Source pixels are read DIRECTLY from the active layer's layer.buffer
//     (an OffscreenCanvas already in the store), NOT via the discarded
//     obtener_region_rgba IPC. This avoids the per-stroke IPC lag the discarded
//     single-pixel-authority introduced, and keeps the read synchronous.
//   - There is no store.setError / replaceLayerBuffer here: errors go to
//     console.error (the established pattern in layerSlice/ImportImageButton),
//     and the JS buffer swap is done via setLayers mapping, mirroring
//     ImportImageButton.
//
// COORDINATE DISCIPLINE (the #1 risk): handles live in SCREEN/CSS px
// (logical*zoom + camera), but fitHandleDrag receives LOGICAL coords
// (clientX/Y un-projected by the SAME getCoords inverse). DPR is NOT involved
// here — camera math operates in CSS px; DPR is applied only inside the 2D
// context scale in componerLienzo, in a SEPARATE block that never touches
// layers.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useStore";
import {
  identity,
  applyToPoint,
  fitHandleDrag,
  type Mat2D,
  type Vec2,
  type HandleId,
  type AxisAlignedBox,
} from "../hooks/engine/transform/affine";
import { cargarPngEnCapa, moverCapa, isTauri } from "../services/tauriService";

interface TransformGizmoProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionMaskRef: React.RefObject<OffscreenCanvas | null>;
  hasSelectionRef: React.RefObject<boolean>;
}

const SCALE_HANDLES: HandleId[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

// Rotate handle vertical offset above the 'n' handle, in CSS px (screen space).
const ROTATE_OFFSET_PX = 28;

// Scan a mask's alpha channel for the tight logical bbox of covered pixels.
// Returns null when no pixel has alpha > 0 (empty selection).
function maskBbox(mask: OffscreenCanvas): AxisAlignedBox | null {
  const ctx = mask.getContext("2d");
  if (!ctx) return null;
  const { width, height } = mask;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export const TransformGizmo: React.FC<TransformGizmoProps> = ({
  canvasRef,
  selectionMaskRef,
  hasSelectionRef,
}) => {
  const camera = useAppStore((s) => s.camera);
  const canvasSize = useAppStore((s) => s.canvasSize);
  const setSettings = useAppStore((s) => s.setSettings);

  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // The transform matrix (logical-space), kept in a ref for per-frame redraws
  // and mirrored into state for handle re-positioning. tick forces a re-render
  // after a drag updates matrixRef.
  const matrixRef = useRef<Mat2D>(identity());
  const [tick, setTick] = useState(0);
  const forceTick = useCallback(() => setTick((t) => t + 1), []);

  // Frozen-at-activation source state.
  const startBoxRef = useRef<AxisAlignedBox | null>(null);
  const sourceBitmapRef = useRef<ImageBitmap | null>(null);
  const targetLayerIdRef = useRef<string | null>(null);
  const isSelectionTargetRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Active-drag state.
  const dragRef = useRef<{
    handle: HandleId | "body";
    baseMatrix: Mat2D;
    startBox: AxisAlignedBox;
    grabLogical: Vec2;
    grabMatrixTranslate: Vec2;
  } | null>(null);

  // Commit re-entry guard: prevents double-commit if Enter is pressed twice or
  // if the component re-renders while the async commit is in flight.
  const isCommittingRef = useRef(false);

  // ---- Coordinate helpers (mirror getCoords / its forward) -----------------
  const clientToLogical = useCallback(
    (clientX: number, clientY: number): Vec2 | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;
      const cam = useAppStore.getState().camera;
      return {
        x: (mouseX - cam.x) / cam.zoom,
        y: (mouseY - cam.y) / cam.zoom,
      };
    },
    [canvasRef],
  );

  const logicalToScreen = useCallback(
    (p: Vec2): Vec2 => ({
      x: p.x * camera.zoom + camera.x,
      y: p.y * camera.zoom + camera.y,
    }),
    [camera],
  );

  // ---- Cancel: drop all frozen source state without touching the layer -----
  const cancel = useCallback(() => {
    matrixRef.current = identity();
    sourceBitmapRef.current?.close?.();
    sourceBitmapRef.current = null;
    startBoxRef.current = null;
    targetLayerIdRef.current = null;
    dragRef.current = null;
    setReady(false);
    const overlay = overlayCanvasRef.current;
    const octx = overlay?.getContext("2d");
    if (overlay && octx) octx.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  // ---- Activation: resolve target + pull source pixels from layer.buffer ---
  useEffect(() => {
    let aborted = false;

    const activate = async () => {
      const store = useAppStore.getState();
      const activeLayer = store.layers.find((l) => l.id === store.activeLayerId);
      if (!activeLayer) {
        console.error("Transform: no active layer.");
        setSettings({ tool: "move" });
        return;
      }
      if (activeLayer.locked) {
        console.error("Transform: the active layer is locked.");
        setSettings({ tool: "move" });
        return;
      }

      const useSelection =
        hasSelectionRef.current === true && !!selectionMaskRef.current;

      let box: AxisAlignedBox | null;
      if (useSelection) {
        box = maskBbox(selectionMaskRef.current as OffscreenCanvas);
        if (!box) {
          console.error("Transform: selection is empty.");
          setSettings({ tool: "move" });
          return;
        }
      } else {
        box = {
          x: activeLayer.x || 0,
          y: activeLayer.y || 0,
          w: activeLayer.buffer.width,
          h: activeLayer.buffer.height,
        };
        if (box.w <= 0 || box.h <= 0) {
          console.error("Transform: layer is empty.");
          setSettings({ tool: "move" });
          return;
        }
      }

      // Build the frozen source canvas (box-sized, logical-space). We read the
      // pixels DIRECTLY from the JS layer.buffer (OffscreenCanvas already in the
      // store) — no IPC. The buffer's pixels live at (0,0) within the buffer,
      // and the buffer itself sits at (layer.x, layer.y) in logical space, so we
      // draw the buffer into the box-sized canvas offset by (layer.x - box.x,
      // layer.y - box.y). For the whole-layer path box origin == layer origin,
      // so the offset is (0,0).
      const srcCanvas = new OffscreenCanvas(box.w, box.h);
      const srcCtx = srcCanvas.getContext("2d");
      if (!srcCtx) {
        console.error("Transform: could not build source canvas.");
        setSettings({ tool: "move" });
        return;
      }
      const layerX = activeLayer.x || 0;
      const layerY = activeLayer.y || 0;
      srcCtx.drawImage(activeLayer.buffer, layerX - box.x, layerY - box.y);

      if (useSelection && selectionMaskRef.current) {
        // Clip the source to the selection coverage within the same bbox. The
        // mask is canvas-sized and lives at (0,0); within our box-sized canvas
        // the mask region starts at (-box.x, -box.y). destination-in keeps only
        // pixels covered by the mask's alpha — same trick brushTool uses.
        srcCtx.globalCompositeOperation = "destination-in";
        srcCtx.drawImage(selectionMaskRef.current, -box.x, -box.y);
        srcCtx.globalCompositeOperation = "source-over";
      }

      const bitmap = await createImageBitmap(srcCanvas);
      if (aborted) {
        bitmap.close?.();
        return;
      }

      matrixRef.current = identity();
      startBoxRef.current = box;
      sourceBitmapRef.current = bitmap;
      targetLayerIdRef.current = activeLayer.id;
      isSelectionTargetRef.current = useSelection;
      setReady(true);
    };

    activate();
    return () => {
      aborted = true;
      cancel();
    };
    // Activate once per mount (the gizmo only mounts while tool === 'transform').
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Preview (per-frame, non-destructive) --------------------------------
  const redrawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    const octx = overlay?.getContext("2d");
    const bitmap = sourceBitmapRef.current;
    const box = startBoxRef.current;
    if (!overlay || !octx || !bitmap || !box) return;

    // Mirror componerLienzo's LAYER block EXACTLY.
    // componerLienzo draws layers in a block that has ONLY translate(camera.x,
    // camera.y) + scale(camera.zoom, camera.zoom) — no dpr. The dpr scale lives
    // in a SEPARATE save/restore block that fills the background color and never
    // touches layers. Matching this no-dpr camera transform aligns the overlay
    // with the rendered layers on all DPR values.
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.translate(camera.x, camera.y);
    octx.scale(camera.zoom, camera.zoom);

    const m = matrixRef.current;
    // Compose the affine matrix on top of the camera transform via transform().
    octx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    // The source bitmap was pulled at the bbox origin; draw it there so the
    // matrix (which transforms logical bbox corners) lands it correctly.
    octx.drawImage(bitmap, box.x, box.y);
  }, [camera]);

  // Resize the overlay canvas to match the visible canvas (device px) and redraw.
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas) return;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    redrawOverlay();
  }, [canvasRef, camera, ready, redrawOverlay]);

  // ---- Pointer interaction -------------------------------------------------
  const onHandlePointerDown = useCallback(
    (handle: HandleId | "body", e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const box = startBoxRef.current;
      if (!box) return;
      const logical = clientToLogical(e.clientX, e.clientY);
      if (!logical) return;
      const m = matrixRef.current;
      dragRef.current = {
        handle,
        baseMatrix: m,
        startBox: box,
        grabLogical: logical,
        grabMatrixTranslate: { x: m[4], y: m[5] },
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [clientToLogical],
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.stopPropagation();
      const logical = clientToLogical(e.clientX, e.clientY);
      if (!logical) return;

      if (drag.handle === "body") {
        // Pure translate: shift the base matrix translation by the logical delta.
        const dx = logical.x - drag.grabLogical.x;
        const dy = logical.y - drag.grabLogical.y;
        const b = drag.baseMatrix;
        matrixRef.current = [
          b[0],
          b[1],
          b[2],
          b[3],
          drag.grabMatrixTranslate.x + dx,
          drag.grabMatrixTranslate.y + dy,
        ];
      } else {
        matrixRef.current = fitHandleDrag({
          base: drag.baseMatrix,
          handle: drag.handle,
          startBox: drag.startBox,
          pointerLogical: logical,
          aspectLock: e.shiftKey,
        });
      }
      redrawOverlay();
      forceTick();
    },
    [clientToLogical, redrawOverlay, forceTick],
  );

  const onHandlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }, []);

  // ---- Commit (Enter) ------------------------------------------------------
  const commit = useCallback(async () => {
    // Re-entry guard: a second Enter press while the first commit is in flight
    // would race against the first. Drop silently — the first is still running.
    if (isCommittingRef.current) return;
    isCommittingRef.current = true;

    try {
      const store = useAppStore.getState();
      const box = startBoxRef.current;
      const bitmap = sourceBitmapRef.current;
      const layerId = targetLayerIdRef.current;
      if (!box || !bitmap || !layerId) return;
      const layer = store.layers.find((l) => l.id === layerId);
      if (!layer) return;

      // Compose in LOGICAL space (no camera) into a full-canvasSize buffer at 0,0.
      const result = new OffscreenCanvas(canvasSize.width, canvasSize.height);
      const ctx = result.getContext("2d");
      if (!ctx) return;

      // 1. Selection target: draw the original then cut the selected hole, so
      //    the un-selected pixels stay put and only the selected region moves.
      //    Whole-layer target: skip drawing the original — the layer itself
      //    moves, so only the transformed copy should exist in the result.
      if (isSelectionTargetRef.current && selectionMaskRef.current) {
        ctx.drawImage(layer.buffer, layer.x || 0, layer.y || 0);
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(selectionMaskRef.current, 0, 0);
        ctx.restore();
      }

      // 2. Draw the transformed source through the affine matrix (logical space).
      const m = matrixRef.current;
      ctx.save();
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(bitmap, box.x, box.y);
      ctx.restore();

      // 3. Bake into Rust via the EXACT ImportImageButton path.
      const blob = await result.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const res = await cargarPngEnCapa(layerId, bytes);
      if (!res.success) {
        // Keep the gizmo usable so the user can retry or Esc. Do NOT swap the JS
        // buffer — the half-state would corrupt the layer.
        console.error("Transform: commit failed.", res.error);
        return;
      }

      // 4. Mirror Rust's replaced buffer on the JS side: the result is
      //    canvas-origin, so reset the layer position to (0,0) and swap the
      //    buffer. Swapping via setLayers mirrors ImportImageButton's pattern.
      //    Keep Rust's layer offset in sync (best-effort; pixels were already
      //    rebaked at canvas origin).
      if (isTauri()) {
        const resMove = await moverCapa(layerId, 0, 0);
        if (!resMove.success) {
          console.error("Transform: could not sync layer position.", resMove.error);
        }
      }
      const latest = useAppStore.getState();
      latest.setLayers(
        latest.layers.map((l) =>
          l.id === layerId ? { ...l, buffer: result, x: 0, y: 0 } : l,
        ),
      );
      latest.forceRender();

      cancel();
      // Leave transform mode after a commit (return to move).
      setSettings({ tool: "move" });
    } finally {
      // Always release the guard so the user can retry (e.g. after a failed commit).
      isCommittingRef.current = false;
    }
  }, [canvasSize, selectionMaskRef, setSettings, cancel]);

  // ---- Keyboard: Esc cancel / Enter commit ---------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        setSettings({ tool: "move" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, commit, setSettings]);

  // ---- Render handles (screen space) ---------------------------------------
  const handlePositions = useMemo(() => {
    const box = startBoxRef.current;
    if (!box || !ready) return null;
    const m = matrixRef.current;
    const cornerOf = (h: HandleId): Vec2 => {
      switch (h) {
        case "nw":
          return { x: box.x, y: box.y };
        case "n":
          return { x: box.x + box.w / 2, y: box.y };
        case "ne":
          return { x: box.x + box.w, y: box.y };
        case "e":
          return { x: box.x + box.w, y: box.y + box.h / 2 };
        case "se":
          return { x: box.x + box.w, y: box.y + box.h };
        case "s":
          return { x: box.x + box.w / 2, y: box.y + box.h };
        case "sw":
          return { x: box.x, y: box.y + box.h };
        case "w":
          return { x: box.x, y: box.y + box.h / 2 };
        case "rotate":
          return { x: box.x + box.w / 2, y: box.y };
      }
    };
    const screenOf = (h: HandleId): Vec2 =>
      logicalToScreen(applyToPoint(m, cornerOf(h)));

    const four = (["nw", "ne", "se", "sw"] as HandleId[]).map(screenOf);
    const scaleScreens = SCALE_HANDLES.map((h) => ({ h, p: screenOf(h) }));
    const nScreen = screenOf("n");

    // Place the rotate handle along the transformed north axis so it tracks
    // the box rotation. Compute the unit vector from the transformed center to
    // the transformed 'n' midpoint, then offset ROTATE_OFFSET_PX along that
    // direction. Falls back to screen-up if center === n (degenerate box).
    const centerScreen = logicalToScreen(
      applyToPoint(m, {
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
      }),
    );
    const dnx = nScreen.x - centerScreen.x;
    const dny = nScreen.y - centerScreen.y;
    const dnLen = Math.hypot(dnx, dny);
    const unx = dnLen > 1e-6 ? dnx / dnLen : 0;
    const uny = dnLen > 1e-6 ? dny / dnLen : -1; // fallback: screen-up
    const rotateScreen = {
      x: nScreen.x + unx * ROTATE_OFFSET_PX,
      y: nScreen.y + uny * ROTATE_OFFSET_PX,
    };

    return { four, scaleScreens, nScreen, rotateScreen, centerScreen };
    // matrixRef.current is read imperatively; tick (via forceTick) drives updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, camera, logicalToScreen, tick]);

  if (!ready || !handlePositions) {
    // Overlay canvas still mounts so the resize effect can size it.
    return (
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-[90]"
      />
    );
  }

  const { four, scaleScreens, rotateScreen, nScreen } = handlePositions;
  const polyPoints = four.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <>
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-[90]"
      />
      {/* Bounding box + rotate stem (SVG, non-interactive) */}
      <svg className="pointer-events-none absolute inset-0 w-full h-full z-[95]">
        <polygon
          points={polyPoints}
          fill="none"
          stroke="rgb(14,165,233)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          x1={nScreen.x}
          y1={nScreen.y}
          x2={rotateScreen.x}
          y2={rotateScreen.y}
          stroke="rgb(14,165,233)"
          strokeWidth={1.5}
        />
      </svg>

      {/* Draggable body (transparent overlay over the box for translate) */}
      <div
        className="absolute z-[96]"
        style={{
          left: Math.min(...four.map((p) => p.x)),
          top: Math.min(...four.map((p) => p.y)),
          width:
            Math.max(...four.map((p) => p.x)) - Math.min(...four.map((p) => p.x)),
          height:
            Math.max(...four.map((p) => p.y)) - Math.min(...four.map((p) => p.y)),
          cursor: "move",
          touchAction: "none",
        }}
        onPointerDown={(e) => onHandlePointerDown("body", e)}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />

      {/* Scale handles */}
      {scaleScreens.map(({ h, p }) => (
        <div
          key={h}
          className="absolute z-[97] rounded-sm border border-white bg-sky-500 shadow"
          style={{
            left: p.x - 5,
            top: p.y - 5,
            width: 10,
            height: 10,
            cursor: "pointer",
            touchAction: "none",
          }}
          onPointerDown={(e) => onHandlePointerDown(h, e)}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        />
      ))}

      {/* Rotate handle */}
      <div
        className="absolute z-[98] rounded-full border border-white bg-amber-400 shadow"
        style={{
          left: rotateScreen.x - 6,
          top: rotateScreen.y - 6,
          width: 12,
          height: 12,
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={(e) => onHandlePointerDown("rotate", e)}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
      />
    </>
  );
};
