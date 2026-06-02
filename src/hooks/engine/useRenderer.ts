// src/hooks/engine/useRenderer.ts
import { useRef, useEffect } from "react";
import { useAppStore } from "../../store/useStore";

export const useRenderer = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) => {
  const { triggerRender, canvasSize } = useAppStore();

  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const wetLayerRef = useRef<OffscreenCanvas | null>(null);
  const cacheBottomRef = useRef<OffscreenCanvas | null>(null);
  const cacheTopRef = useRef<OffscreenCanvas | null>(null);
  const selectionMaskRef = useRef<OffscreenCanvas | null>(null);

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas || canvasSize.width === 0) return;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  contextRef.current = ctx;

  const parent = canvas.parentElement;
  if (!parent) return;

  // 🚀 FIX BUG: El ajustador de resolución
  const resizeMonitor = () => {
    // 🛡️ OOM FIX: Limitamos la densidad de pixeles en pantallas Retina/4k para no superar VRAM limits
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = Math.min(rawDpr, 1.5);

    // Ajustamos la memoria física al nuevo tamaño visual del contenedor
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Repintamos todo para que no parpadee
    componerLienzo(false);
  };

  // 🚀 LA MAGIA: ResizeObserver vigila los cambios de diseño internos (como cerrar paneles)
  const resizeObserver = new ResizeObserver(() => {
    resizeMonitor();
  });

  // Le decimos que vigile al contenedor del Canvas
  resizeObserver.observe(parent);

  // Los Buffers (El Mundo) mantienen su tamaño lógico
  if (!wetLayerRef.current)
    wetLayerRef.current = new OffscreenCanvas(
      canvasSize.width,
      canvasSize.height,
    );
  if (!cacheBottomRef.current)
    cacheBottomRef.current = new OffscreenCanvas(
      canvasSize.width,
      canvasSize.height,
    );
  if (!cacheTopRef.current)
    cacheTopRef.current = new OffscreenCanvas(
      canvasSize.width,
      canvasSize.height,
    );
  if (!selectionMaskRef.current)
    selectionMaskRef.current = new OffscreenCanvas(
      canvasSize.width,
      canvasSize.height,
    );

  const timeout = setTimeout(() => {
    const state = useAppStore.getState();
    if (state.layers.length === 0) {
      state.addLayer();
      state.resetCamera(); // Centramos la cámara al nacer
    }
  }, 10);

  return () => {
    // 🚀 FIX: Apagamos el observador al desmontar
    resizeObserver.disconnect();
    clearTimeout(timeout);
  };
}, [canvasRef, canvasSize]);

// 🚀 Cargamos el estado de la cámara

  const prepararCacheDeRender = () => {
    const { layers, activeLayerId, canvasSize } = useAppStore.getState();
    const bottomCtx = cacheBottomRef.current?.getContext("2d");
    const topCtx = cacheTopRef.current?.getContext("2d");

    if (!bottomCtx || !topCtx) return;

    bottomCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    topCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    let passedActive = false;
    layers.forEach((layer) => {
      if (!layer.visible || layer.opacity === 0) return;
      if (layer.id === activeLayerId) {
        passedActive = true;
        return;
      }
      if (!passedActive) {
        bottomCtx.globalAlpha = layer.opacity;
        bottomCtx.drawImage(layer.buffer, layer.x || 0, layer.y || 0);
      } else {
        topCtx.globalAlpha = layer.opacity;
        topCtx.drawImage(layer.buffer, layer.x || 0, layer.y || 0);
      }
    });

    bottomCtx.globalAlpha = 1.0;
    topCtx.globalAlpha = 1.0;
  };

  const componerLienzo = (isDrawing: boolean) => {
    const screenCtx = contextRef.current;
    const canvas = canvasRef.current;
    if (!screenCtx || !canvas) return;

    const { layers, activeLayerId, canvasSize, settings, camera } =
      useAppStore.getState();

    // 🚀 2. LA MAGIA: Limpiamos la pantalla y dibujamos el color del espacio exterior
    screenCtx.save();
    screenCtx.setTransform(1, 0, 0, 1, 0, 0); // Limpiamos matrices previas
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = Math.min(rawDpr, 1.5);
    screenCtx.scale(dpr, dpr);
    screenCtx.fillStyle = "#171717"; // El color de fondo oscuro de tu app
    screenCtx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    screenCtx.restore();

    // 🚀 3. LA CÁMARA (Matriz de Transformación)
    screenCtx.save();
    screenCtx.translate(camera.x, camera.y); // Paneo
    screenCtx.scale(camera.zoom, camera.zoom); // Zoom

    // Pintamos el "Papel" de la obra
    screenCtx.fillStyle = "#ffffff";
    screenCtx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // 🚀 RECORTE RESILIENTE: Limitamos el renderizado al espacio del papel
    // Las capas flotan en memoria y pueden extenderse más allá, pero aquí
    // las recortamos al área lógica para mantener limpios los límites del lienzo.
    screenCtx.beginPath();
    screenCtx.rect(0, 0, canvasSize.width, canvasSize.height);
    screenCtx.clip();

    // Pintamos las capas
    if (isDrawing) {
      if (cacheBottomRef.current)
        // Los cachés de renderizado (abajo y arriba) son del tamaño del lienzo, se quedan en 0,0
        screenCtx.drawImage(cacheBottomRef.current, 0, 0);

      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (activeLayer && activeLayer.visible && activeLayer.opacity > 0) {
        screenCtx.globalAlpha = activeLayer.opacity;

        // 🚀 FIX APLICADO: Dibujamos la capa activa en sus coordenadas flotantes reales
        screenCtx.drawImage(
          activeLayer.buffer,
          activeLayer.x || 0,
          activeLayer.y || 0,
        );

        if (wetLayerRef.current) {
          screenCtx.save();
          
          screenCtx.globalAlpha = activeLayer.opacity * settings.opacity;
          screenCtx.globalCompositeOperation =
            settings.tool === "eraser" ? "destination-out" : "source-over";

          // El cristal de pintura húmeda es global al lienzo, se queda en 0,0
          screenCtx.drawImage(wetLayerRef.current, 0, 0);
          screenCtx.restore();
        }
      }

      if (cacheTopRef.current) {
        screenCtx.globalAlpha = 1.0;
        screenCtx.drawImage(cacheTopRef.current, 0, 0);
      }
    } else {
      // Modo reposo: Dibujamos todas las capas
      layers.forEach((layer) => {
        if (!layer.visible || layer.opacity === 0) return;
        screenCtx.globalAlpha = layer.opacity;

        // 🚀 FIX APLICADO: Al soltar el ratón (reposo), todas las capas respetan su X e Y
        screenCtx.drawImage(layer.buffer, layer.x || 0, layer.y || 0);
      });
    }

    if (selectionMaskRef.current) {
      screenCtx.globalAlpha = 0.35;
      screenCtx.drawImage(selectionMaskRef.current, 0, 0);
    }

    screenCtx.restore(); // Quitamos la cámara para el siguiente frame
  };

  useEffect(() => {
    componerLienzo(false);
  }, [triggerRender]);

  return {
    wetLayerRef,
    contextRef,
    selectionMaskRef,
    prepararCacheDeRender,
    componerLienzo,
  };
};
