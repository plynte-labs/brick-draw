// src/hooks/engine/useStrokeDryer.ts
import { useEffect } from "react";
import { moverCapa, procesarTrazo } from "../../services/tauriService";
import { useAppStore } from "../../store/useStore";

interface DryerProps {
  wetLayerRef: React.RefObject<OffscreenCanvas | null>;
  isDrawingRef: React.RefObject<boolean>;
  setIsDrawing: (val: boolean) => void;
  strokePointsRef: React.RefObject<{ x: number; y: number; p: number }[]>;
  componerLienzo: (isDrawing: boolean) => void;
  hasSelectionRef: React.RefObject<boolean>;
}

export const useStrokeDryer = ({
  wetLayerRef,
  isDrawingRef,
  setIsDrawing,
  strokePointsRef,
  componerLienzo,
  hasSelectionRef,
}: DryerProps) => {
  useEffect(() => {
    const globalUp = async () => {
      if (!isDrawingRef.current) return;

      setIsDrawing(false);
      isDrawingRef.current = false;

      const state = useAppStore.getState();
      const activeLayer = state.layers.find(
        (l) => l.id === state.activeLayerId,
      );
      const { width, height } = state.canvasSize;

      // 1. 🚀 ESTAMPADO MATEMÁTICO PERFECTO EN JS
      if (activeLayer && wetLayerRef.current) {
          
        // --- AUTO-EXPANSIÓN DINÁMICA DE LA CAPA ---
        if (strokePointsRef.current && strokePointsRef.current.length > 0 && state.settings.tool !== "eraser") {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const padding = state.settings.size * Math.max(0.5, strokePointsRef.current[strokePointsRef.current.length - 1]?.p || 1.0) * 2.0;
            
            strokePointsRef.current.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            });
            minX -= padding; minY -= padding;
            maxX += padding; maxY += padding;
            
            const oldLx = activeLayer.x || 0;
            const oldLy = activeLayer.y || 0;
            const oldW = activeLayer.buffer.width;
            const oldH = activeLayer.buffer.height;
            
            let newLx = Math.floor(Math.min(oldLx, minX));
            let newLy = Math.floor(Math.min(oldLy, minY));
            let newRight = Math.ceil(Math.max(oldLx + oldW, maxX));
            let newBottom = Math.ceil(Math.max(oldLy + oldH, maxY));
            
            let newW = newRight - newLx;
            let newH = newBottom - newLy;
            
            if (newW > oldW || newH > oldH) {
                const newBuffer = new OffscreenCanvas(newW, newH);
                const ctx = newBuffer.getContext("2d");
                if (ctx) {
                    ctx.drawImage(activeLayer.buffer, oldLx - newLx, oldLy - newLy);
                    activeLayer.buffer = newBuffer; 
                    useAppStore.getState().setLayerPosition(activeLayer.id, newLx, newLy);
                    activeLayer.x = newLx; // Sincronización imperativa segura para el stamp inmediato
                    activeLayer.y = newLy;
                }
            }
        }
        
        const layerCtx = activeLayer.buffer.getContext("2d");
        if (layerCtx) {
          layerCtx.save(); // 🛡️ Guardamos el estado limpio

          // Compensamos el movimiento de la capa Moviendo la cámara interna del buffer
          layerCtx.translate(-activeLayer.x, -activeLayer.y);

          layerCtx.globalAlpha =
            state.settings.tool === "move" ? 1.0 : state.settings.opacity;
          layerCtx.globalCompositeOperation =
            state.settings.tool === "eraser"
              ? "destination-out"
              : "source-over";

          // Estampamos (La matemática de translate se encarga de que caiga milimétricamente exacto)
          layerCtx.drawImage(wetLayerRef.current, 0, 0);

          layerCtx.restore(); // 🛡️ Restauramos el buffer a la normalidad
        }
      }

      // 2. Limpiar cristal húmedo
      if (wetLayerRef.current) {
        wetLayerRef.current.getContext("2d")?.clearRect(0, 0, width, height);
      }

      // 3. Render final en pantalla
      componerLienzo(false);

      // 4. 🚀 LA MAGIA DE SINCRONIZACIÓN CON RUST
      if (activeLayer) {
        if (state.settings.tool === "move") {
          // 🚀 FIX: Ya NO enviamos PNG pesados. Solo mandamos 2 números por el puente. Rendimiento 10/10.
          moverCapa(activeLayer.id, activeLayer.x, activeLayer.y).catch(
            console.error
          );
        } else if (
          strokePointsRef.current &&
          strokePointsRef.current.length > 1
        ) {
          // Si es Pincel o Goma, seguimos enviando vectores rápidos
          try {
            // 🚀 1. RECIBIMOS LA RESPUESTA DE RUST (LayerBounds)
            const res = await procesarTrazo(
              activeLayer.id,
              strokePointsRef.current,
              state.settings.tool,
              state.settings.color,
              state.settings.size,
              state.settings.opacity
            );

            // 🚀 2. SI RUST EXPANDIÓ LA CAPA, ACTUALIZAMOS REACT INMEDIATAMENTE
            if (res.success && res.data) {
              useAppStore
                .getState()
                .setLayerPosition(activeLayer.id, res.data.x, res.data.y);
            }

            // Limpiamos la capa húmeda porque ya se secó en Rust
            const wetCtx = wetLayerRef.current?.getContext("2d");
            if (wetCtx) {
              wetCtx.clearRect(
                0,
                0,
                state.canvasSize.width,
                state.canvasSize.height,
              );
            }

            // Pedimos la foto final
            componerLienzo(false);
          } catch (error) {
            console.error("Error secando el trazo:", error);
          }
        }
      }

      if (strokePointsRef.current) strokePointsRef.current.length = 0;
    };

    window.addEventListener("pointerup", globalUp);
    return () => window.removeEventListener("pointerup", globalUp);
  }, [
    wetLayerRef,
    isDrawingRef,
    setIsDrawing,
    strokePointsRef,
    componerLienzo,
    hasSelectionRef,
  ]);
};
