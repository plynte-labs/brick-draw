import { calcularSeleccionVarita } from "../../../services/tauriService";
import { DrawingToolStrategy } from "./types";

export const wandTool: DrawingToolStrategy = {
  onPointerDown: async ({ state, coords, refs, actions }) => {
    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
    if (!activeLayer) return;

    // 🚀 AHORA USAMOS COORDENADAS GLOBALES DIRECTAMENTE
    const globalStartX = Math.round(coords.x);
    const globalStartY = Math.round(coords.y);

    // Evitamos enviar coordenadas negativas si el usuario hace clic fuera de la pantalla (por error)
    if (globalStartX < 0 || globalStartY < 0) return;

    try {
      console.log("🪄 Calculando selección de varita...");

      const res = await calcularSeleccionVarita(
        activeLayer.id,
        globalStartX,
        globalStartY,
        0.15
      );
      if (!res.success) throw new Error(res.error);
      const maskBytes = res.data;

      const blob = new Blob([new Uint8Array(maskBytes)], { type: "image/png" });
      const imgBitmap = await createImageBitmap(blob);

      if (refs.selectionMask?.current) {
        const selCtx = refs.selectionMask.current.getContext("2d");
        if (selCtx) {
          const { modifiers, canvasSize } = state;

          if (modifiers.shift) {
            selCtx.globalCompositeOperation = "source-over";
          } else if (modifiers.ctrl) {
            selCtx.globalCompositeOperation = "destination-out";
          } else {
            selCtx.globalCompositeOperation = "source-over";
            selCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);
          }

          // 🚀 Dibujamos la máscara directamente en el origen (0,0)
          selCtx.drawImage(imgBitmap, 0, 0);

          refs.hasSelection.current = true;
          actions.componerLienzo(false);
        }
      }
    } catch (error) {
      console.error("Error en la varita:", error);
    }
  },
  onPointerMove: () => false,
};
