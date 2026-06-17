// src/hooks/useDrawingEngine.ts
import { useRef, useState, useEffect } from "react";
import { useAppStore } from "../store/useStore";
import { useRenderer } from "./engine/useRenderer";
import { useStrokeDryer } from "./engine/useStrokeDryer";
import { getToolStrategy } from "./engine/tools";
import { EngineContext } from "./engine/tools/types";

export const useDrawingEngine = (canvasRef: React.RefObject<HTMLCanvasElement | null>) => {
  const [, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const isRendering = useRef(false);
  const hasSelectionRef = useRef(false);

  const currentPoint = useRef({ x: 0, y: 0 });
  const lastPoint = useRef({ x: 0, y: 0 });
  const strokePointsRef = useRef<{ x: number; y: number; p: number }[]>([]);
  // Estabilización: último punto CRUDO del puntero (sin suavizar). Al soltar, el dryer lo agrega
  // como punto final para que el trazo SIEMPRE llegue a donde levantaste (si no, el EMA lo deja corto).
  const lastRawPointRef = useRef<{ x: number; y: number; p: number } | null>(null);

  const {
    wetLayerRef,
    contextRef,
    selectionMaskRef,
    prepararCacheDeRender,
    componerLienzo,
  } = useRenderer(canvasRef);

  // Deseleccionar (se mantiene igual, usando tamaño dinámico)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        hasSelectionRef.current = false;
        if (selectionMaskRef.current) {
          const { width, height } = useAppStore.getState().canvasSize;
          const ctx = selectionMaskRef.current.getContext("2d");
          ctx?.clearRect(0, 0, width, height);
        }
        componerLienzo(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMaskRef, componerLienzo]);

  useStrokeDryer({
    wetLayerRef,
    isDrawingRef,
    setIsDrawing,
    strokePointsRef,
    componerLienzo,
    hasSelectionRef,
    lastRawPoint: lastRawPointRef,
  });

  // ==========================================
  // 🚀 LA NUEVA MATEMÁTICA DE COORDENADAS
  // ==========================================
  // En src/hooks/useDrawingEngine.ts
  const getCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const { camera } = useAppStore.getState();

    // Posición del ratón en la pantalla HTML
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // 🚀 INVERSIÓN DE LA MATRIZ: Restamos el paneo y dividimos por el zoom
    const logicalX = (mouseX - camera.x) / camera.zoom;
    const logicalY = (mouseY - camera.y) / camera.zoom;

    window.dispatchEvent(
      new CustomEvent("plynte-coords", {
        detail: { x: Math.round(logicalX), y: Math.round(logicalY) },
      }),
    );

    return { x: logicalX, y: logicalY };
  };

  const buildEngineContext = (
    clientX: number,
    clientY: number,
    pressure: number,
    events?: PointerEvent[],
  ): EngineContext | null => {
    const state = useAppStore.getState();
    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);

    if (!activeLayer || activeLayer.locked) return null;
    const coords = getCoords(clientX, clientY); // Usamos la nueva matemática
    if (!coords) return null;

    return {
      state,
      coords,
      pressure,
      events,
      refs: {
        wetLayer: wetLayerRef,
        selectionMask: selectionMaskRef,
        hasSelection: hasSelectionRef,
        isDrawing: isDrawingRef,
        currentPoint,
        lastPoint,
        strokePoints: strokePointsRef,
      },
      actions: {
        prepararCache: prepararCacheDeRender,
        componerLienzo,
        getCoords,
        setIsDrawing,
      },
    };
  };

  const startDrawing = async (
    clientX: number,
    clientY: number,
    pressure: number,
  ) => {
    lastRawPointRef.current = null; // nuevo trazo: sin punto de flush todavía
    const ctx = buildEngineContext(clientX, clientY, pressure);
    if (!ctx) return;
    const strategy = getToolStrategy(ctx.state.settings.tool);
    await strategy.onPointerDown(ctx);
  };

  const processPointerMove = (events: PointerEvent[]) => {
    const state = useAppStore.getState();
    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);

    if (
      !isDrawingRef.current ||
      !activeLayer ||
      activeLayer.locked ||
      !contextRef.current
    )
      return;

    const ctx = buildEngineContext(
      events[0].clientX,
      events[0].clientY,
      events[0].pressure || 0.5,
      events,
    );
    if (!ctx) return;

    const strategy = getToolStrategy(ctx.state.settings.tool);
    const needsRender = strategy.onPointerMove(ctx);

    // Estabilización: registrar el punto CRUDO del último evento (no suavizado) para el flush al soltar.
    const lastEv = events[events.length - 1];
    const rawCoords = getCoords(lastEv.clientX, lastEv.clientY);
    if (rawCoords) {
      lastRawPointRef.current = { x: rawCoords.x, y: rawCoords.y, p: lastEv.pressure || 0.5 };
    }

    if (needsRender && !isRendering.current) {
      isRendering.current = true;
      requestAnimationFrame(() => {
        componerLienzo(true);
        isRendering.current = false;
      });
    }
  };

  return { startDrawing, processPointerMove };
};;
