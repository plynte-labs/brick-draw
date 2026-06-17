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
  // Estabilización: punto crudo de levantamiento para el flush (evita que el trazo quede corto).
  lastRawPoint: React.RefObject<{ x: number; y: number; p: number } | null>;
}

export const useStrokeDryer = ({
  wetLayerRef,
  isDrawingRef,
  setIsDrawing,
  strokePointsRef,
  componerLienzo,
  hasSelectionRef,
  lastRawPoint,
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

      // ── ESTABILIZACIÓN — FLUSH del punto final ──
      // El suavizado (EMA) deja el último punto procesado rezagado DETRÁS del cursor. Sin esto el
      // trazo (sobre todo la goma rápida) "se corta a la mitad". Agregamos el punto CRUDO de
      // levantamiento al cristal húmedo y a strokePoints para que el trazo llegue a donde soltaste.
      if (
        state.settings.tool !== "move" &&
        lastRawPoint.current &&
        strokePointsRef.current &&
        strokePointsRef.current.length > 0
      ) {
        const raw = lastRawPoint.current;
        const last = strokePointsRef.current[strokePointsRef.current.length - 1];
        if (Math.abs(raw.x - last.x) > 0.5 || Math.abs(raw.y - last.y) > 0.5) {
          const wetCtx = wetLayerRef.current?.getContext("2d");
          if (wetCtx) {
            wetCtx.lineCap = "round";
            wetCtx.lineJoin = "round";
            wetCtx.strokeStyle =
              state.settings.tool === "eraser"
                ? "rgba(255, 255, 255, 1)"
                : state.settings.color;
            wetCtx.lineWidth = state.settings.size * (raw.p || 0.5) * 2;
            wetCtx.beginPath();
            wetCtx.moveTo(last.x, last.y);
            wetCtx.lineTo(raw.x, raw.y);
            wetCtx.stroke();
          }
          strokePointsRef.current.push({ x: raw.x, y: raw.y, p: raw.p });
        }
      }

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
          // Snapshot de los puntos de ESTE trazo: procesarTrazo es async y, si el usuario arranca
          // otro trazo durante el await, strokePointsRef.current ya sería del trazo NUEVO.
          const pointsThisStroke = strokePointsRef.current.slice();
          try {
            // 🚀 1. Commit del trazo a Rust (SIEMPRE corre — confirma el dibujo/borrado nativo).
            const res = await procesarTrazo(
              activeLayer.id,
              pointsThisStroke,
              state.settings.tool,
              state.settings.color,
              state.settings.size,
              state.settings.opacity
            );

            // ── RACE GUARD ──
            // Si durante el await empezó un trazo NUEVO (isDrawing volvió a true), NO tocamos los
            // refs compartidos (wet, strokePoints) ni la composición: ya pertenecen al trazo nuevo.
            // Antes, el dryer async del trazo anterior limpiaba el wet y reseteaba strokePoints del
            // trazo nuevo → "la goma no toma desde el clic, arranca desde la mitad del recorrido".
            if (!isDrawingRef.current) {
              if (res.success && res.data) {
                useAppStore
                  .getState()
                  .setLayerPosition(activeLayer.id, res.data.x, res.data.y);
              }
              const wetCtx = wetLayerRef.current?.getContext("2d");
              if (wetCtx) {
                wetCtx.clearRect(
                  0,
                  0,
                  state.canvasSize.width,
                  state.canvasSize.height,
                );
              }
              componerLienzo(false);
            }
          } catch (error) {
            console.error("Error secando el trazo:", error);
          }
        }
      }

      // Reset de puntos SOLO si no hay un trazo nuevo en curso (si lo hay, su onPointerDown ya los
      // reinicializó; borrarlos acá cortaría el trazo nuevo).
      if (!isDrawingRef.current && strokePointsRef.current) {
        strokePointsRef.current.length = 0;
      }
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
    lastRawPoint,
  ]);
};
