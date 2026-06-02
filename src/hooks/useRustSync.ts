// src/hooks/useRustSync.ts
import { useAppStore } from "../store/useStore"; 
import { obtenerCapaPng } from "../services/tauriService";
import { useEffect } from "react";

export const useRustSync = () => {
  const { forceRender, canvasSize, isCanvasInitialized } = useAppStore();

  useEffect(() => {
    // 🚀 Evitamos intentar recuperar algo si ni siquiera hemos elegido el tamaño
    if (!isCanvasInitialized) return;

    const recuperarPasadoDeRust = async () => {
      try {
        const layerId = "base";
        const res = await obtenerCapaPng(layerId);
        if (!res.success) {
          throw new Error(res.error);
        }
        const pngBytes = res.data;

        const state = useAppStore.getState();
        const layer = state.layers.find((l) => l.id === layerId);

        if (layer) {
          const ctx = layer.buffer.getContext("2d");
          if (!ctx) return;

          const blob = new Blob([new Uint8Array(pngBytes)], {
            type: "image/png",
          });
          const imgBitmap = await createImageBitmap(blob);

          ctx.globalCompositeOperation = "source-over";

          // 🚀 FIX: Adiós al 2000x1500, usamos el tamaño dinámico
          ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
          ctx.drawImage(imgBitmap, 0, 0);

          console.log("🔄 Sincronización post-recarga completada");
          forceRender();
        }
      } catch (e) {
        console.log("No hay historial previo en Rust o capa no encontrada.");
      }
    };

    recuperarPasadoDeRust();
  }, [forceRender, isCanvasInitialized, canvasSize]);
};