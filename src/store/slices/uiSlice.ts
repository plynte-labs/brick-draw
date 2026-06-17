// src/store/slices/uiSlice.ts
import { AppSlice, UISlice } from "../types";
import { fitToView } from "../../hooks/engine/camera";

export const createUISlice: AppSlice<UISlice> = (set) => ({
  isLayerPanelOpen: true,
  triggerRender: 0,
  isCanvasInitialized: false,
  canvasSize: { width: 0, height: 0 },
  panelOrder: ["tools", "color", "layers"],
  setPanelOrder: (newOrder) => set({ panelOrder: newOrder}),

  // 🚀 CÁMARA SIMPLIFICADA: Solo zoom y posición de scroll
  camera: { x: 0, y: 0, zoom: 1 },

  setCamera: (cam) =>
    set((state) => ({
      camera: { ...state.camera, ...cam },
      triggerRender: state.triggerRender + 1, // 🚀 OBLIGAMOS A REDIBUJAR
    })),

  resetCamera: (containerWidth?: number, containerHeight?: number) =>
    set((state) => {
      // Si no le pasan medidas, usa la ventana
      const screenW = containerWidth || window.innerWidth;
      const screenH = containerHeight || window.innerHeight;

      // Pure fit math lives in camera.ts (centered, clamped, zero-dim guarded).
      const camera = fitToView(
        state.canvasSize.width,
        state.canvasSize.height,
        screenW,
        screenH,
      );

      return {
        camera,
        triggerRender: state.triggerRender + 1,
      };
    }),

  forceRender: () =>
    set((state) => ({ triggerRender: state.triggerRender + 1 })),
  toggleLayerPanel: () =>
    set((state) => ({ isLayerPanelOpen: !state.isLayerPanelOpen })),
  initCanvas: (width: number, height: number) =>
    set({ isCanvasInitialized: true, canvasSize: { width, height } }),

  // IMPLEMENTACIÓN DE ESTADOS DE CARGA
  isLoading: false,
  loadingMessage: "",
  loadingProgress: 0,
  setLoading: (loading, message = "", progress = 0) =>
    set({ isLoading: loading, loadingMessage: message, loadingProgress: progress }),
});
