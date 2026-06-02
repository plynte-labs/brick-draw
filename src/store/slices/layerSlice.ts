// src/store/slices/layerSlice.ts
import { AppSlice, LayerSlice, Layer } from "../types";
import {
  isTauri,
  anadirCapa,
  activarCapa,
  cambiarVisibilidadCapa,
  cambiarOpacidadCapa,
  eliminarCapa,
  guardarProyectoBrick,
  cargarProyectoBrick,
} from "../../services/tauriService";
import { CanvasMetadataDto } from "../../types/CanvasMetadataDto";

// Helper aislado para este slice
const createBuffer = (width: number, height: number) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, width, height);
  return canvas;
};

export const createLayerSlice: AppSlice<LayerSlice> = (set, get) => ({
  layers: [],
  activeLayerId: null,
  clearSelection: async () => {
    console.log("Limpiando selección del lienzo...");
    // Aquí a futuro llamaremos a Rust para que borre la máscara (Ej: await invoke('limpiar_mascara'))
    // Por ahora solo forzamos a React a repintar para que quite el efecto visual
    get().forceRender();
  },

  toggleLayerLock: (id: string) => {
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, locked: !l.locked } : l,
      ),
    }));
    get().forceRender();
  },

  // 🚀 FIX: Convertimos a asíncrono y esperamos a Rust
  addLayer: async () => {
    const { canvasSize } = get();
    const newId = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      if (isTauri()) {
        // 1. ESPERAMOS a que Rust reserve la memoria y confirme
        const res = await anadirCapa(newId, canvasSize.width, canvasSize.height);
        if (!res.success) {
          throw new Error(res.error);
        }
      } else {
        console.warn("Plynte Engine: Modo navegador");
      }

      // 2. SOLO si Rust tuvo éxito, creamos la capa visual en React
      const buffer = createBuffer(canvasSize.width, canvasSize.height);

      set((state) => ({
        layers: [
          ...state.layers,
          {
            id: newId,
            name: `Capa ${state.layers.length + 1}`,
            buffer,
            opacity: 1,
            visible: true,
            locked: false,
            x: 0,
            y: 0,
          },
        ],
        activeLayerId: newId,
      }));
      get().forceRender();
    } catch (error) {
      console.error(
        "Rust rechazó crear la capa (Posible falta de memoria):",
        error,
      );
      // Aquí la UI no cambia, evitando la "capa fantasma"
    }
  },

  setActiveLayer: async (id: string) => {
    try {
      if (isTauri()) {
        const res = await activarCapa(id);
        if (!res.success) {
          throw new Error(res.error);
        }
      }

      set({ activeLayerId: id });
      get().forceRender();
    } catch (error) {
      console.error("Rust rechazó el cambio de capa:", error);
    }
  },

  toggleLayerVisibility: async (id: string) => {
    const layer = get().layers.find((l) => l.id === id);
    if (!layer) return;

    try {
      if (isTauri()) {
        const res = await cambiarVisibilidadCapa(id, !layer.visible);
        if (!res.success) {
          throw new Error(res.error);
        }
      }

      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === id ? { ...l, visible: !l.visible } : l,
        ),
      }));
      get().forceRender();
    } catch (error) {
      console.error("Rust rechazó ocultar la capa:", error);
    }
  },

  setLayerOpacity: async (id: string, opacity: number) => {
    try {
      if (isTauri()) {
        const res = await cambiarOpacidadCapa(id, opacity);
        if (!res.success) {
          throw new Error(res.error);
        }
      }

      set((state) => ({
        layers: state.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
      }));
      get().forceRender();
    } catch (error) {
      console.error("Rust rechazó cambiar la opacidad:", error);
    }
  },

  removeLayer: async (id: string) => {
    try {
      if (isTauri()) {
        const res = await eliminarCapa(id);
        if (!res.success) {
          throw new Error(res.error);
        }
      }

      set((state) => {
        const newLayers = state.layers.filter((l) => l.id !== id);
        return {
          layers: newLayers,
          activeLayerId:
            state.activeLayerId === id
              ? newLayers[newLayers.length - 1]?.id || null
              : state.activeLayerId,
        };
      });
      get().forceRender();
    } catch (error) {
      console.error("Rust rechazó eliminar la capa:", error);
    }
  },

  renameLayer: (id: string, newName: string) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, name: newName } : l,
      ),
    })),

  setLayers: (newLayers: Layer[]) => {
    set({ layers: newLayers });
    get().forceRender();
  },

  setLayerPosition: (id: string, x: number, y: number) => {
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, x, y } : l)),
    }));
    // Sigue sin forceRender para máxima fluidez al mover
  },

  saveProject: async (path: string) => {
    try {
      const { layers, activeLayerId, canvasSize } = get();
      if (!isTauri()) {
        console.warn("Modo navegador: No se puede guardar proyecto en disco");
        return false;
      }

      const metadata: CanvasMetadataDto = {
        canvas_width: canvasSize.width,
        canvas_height: canvasSize.height,
        active_layer_id: activeLayerId || "",
        version: "1.0.0",
        layers: layers.map((l) => ({
          id: l.id,
          name: l.name,
          opacity: l.opacity,
          visible: l.visible,
          locked: l.locked,
          x: l.x,
          y: l.y,
          width: l.buffer.width,
          height: l.buffer.height,
        })),
      };

      const res = await guardarProyectoBrick(path, metadata);
      if (!res.success) {
        throw new Error(res.error);
      }

      console.log("Proyecto guardado con éxito:", res.data);
      return true;
    } catch (e) {
      console.error("Error al guardar proyecto .brick:", e);
      alert(`Error al guardar el proyecto: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  },

  loadProject: async (path: string) => {
    try {
      if (!isTauri()) {
        console.warn("Modo navegador: No se puede cargar proyecto de disco");
        return false;
      }

      // Activar pantalla de carga global
      get().setLoading(true, "Abriendo archivo contenedor .brick...", 5);

      // 🚀 INTERVALO OPTIMISTA: Incrementa el porcentaje sutilmente para mostrar actividad
      // mientras el backend de Rust corre la descompresión nativa y la des-premultiplicación SIMD en disco.
      let currentProgress = 5;
      const progressInterval = setInterval(() => {
        if (currentProgress < 19) {
          currentProgress += 1;
          get().setLoading(
            true, 
            "Descomprimiendo y decodificando capas con SIMD nativo...", 
            currentProgress
          );
        }
      }, 350);

      let res;
      try {
        res = await cargarProyectoBrick(path);
      } finally {
        clearInterval(progressInterval);
      }

      if (!res.success) {
        throw new Error(res.error);
      }

      get().setLoading(true, "Descomprimiendo y cargando metadatos del lienzo...", 15);

      const { canvas_width, canvas_height, active_layer_id, layers, raw_buffers } = res.data;

      // Reconstruir las capas visuales de forma progresiva y responsiva (previene UI-freeze)
      const reconstructedLayers: Layer[] = [];
      const totalLayers = layers.length;

      for (let i = 0; i < totalLayers; i++) {
        const layerMeta = layers[i];
        
        // Reportar progreso detallado al usuario
        const pct = Math.round(20 + (i / totalLayers) * 75);
        get().setLoading(true, `Procesando capa ${i + 1} de ${totalLayers} (${layerMeta.name})...`, pct);

        // Yield al event loop de JS cada 3 capas para evitar cualquier freeze visual
        if (i % 3 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }

        const width = layerMeta.width || 1;
        const height = layerMeta.height || 1;
        const buffer = new OffscreenCanvas(width, height);
        const ctx = buffer.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, width, height);

          const rawBytes = raw_buffers[layerMeta.id];
          if (rawBytes) {
            let clampedArray: Uint8ClampedArray;
            // Tauri puede serializar Vec<u8> como un array convencional de números en objetos JSON
            if (Array.isArray(rawBytes)) {
              clampedArray = new Uint8ClampedArray(rawBytes);
            } else if (rawBytes && (rawBytes as any).buffer) {
              clampedArray = new Uint8ClampedArray(
                (rawBytes as any).buffer,
                (rawBytes as any).byteOffset || 0,
                (rawBytes as any).byteLength || (rawBytes as any).length
              );
            } else {
              clampedArray = new Uint8ClampedArray(rawBytes as any);
            }

            const imageData = new ImageData(clampedArray, width, height);
            ctx.putImageData(imageData, 0, 0);
          }
        }

        reconstructedLayers.push({
          id: layerMeta.id,
          name: layerMeta.name,
          visible: layerMeta.visible,
          locked: layerMeta.locked,
          opacity: layerMeta.opacity,
          buffer,
          x: layerMeta.x,
          y: layerMeta.y,
        });
      }

      get().setLoading(true, "Pintando lienzo en la GPU...", 98);
      await new Promise((r) => setTimeout(r, 50)); // Respiro final para pintar la barra completa

      // Actualizar el Zustand store de golpe
      set({
        canvasSize: { width: canvas_width, height: canvas_height },
        isCanvasInitialized: true,
        layers: reconstructedLayers,
        activeLayerId: active_layer_id,
      });

      // Renderizado final limpio
      get().forceRender();

      // Apagar pantalla de carga
      get().setLoading(false);

      console.log("Proyecto .brick cargado y renderizado con éxito!");
      return true;
    } catch (e) {
      get().setLoading(false);
      console.error("Error al cargar proyecto .brick:", e);
      alert(`Error al cargar el proyecto: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  },
});
