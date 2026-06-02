// src/hooks/engine/tools/moveTool.ts
import { DrawingToolStrategy } from "./types";
import { useAppStore } from "../../../store/useStore";

let startCoords = { x: 0, y: 0 };
let initialLayerPos = { x: 0, y: 0 };

export const moveTool: DrawingToolStrategy = {
  onPointerDown: ({ state, coords, refs, actions }) => {
    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
    if (!activeLayer) return;

    // 🚀 FIX 1: Preparamos el caché para despegar la capa del fondo
    actions.prepararCache();

    // Guardamos dónde hicimos clic y dónde estaba la capa
    // Usamos || 0 por si la capa es vieja y no tenía coordenadas
    startCoords = { x: coords.x, y: coords.y };
    initialLayerPos = { x: activeLayer.x || 0, y: activeLayer.y || 0 };

    actions.setIsDrawing(true);
    refs.isDrawing.current = true;
  },

  onPointerMove: ({ events, state, refs, actions }) => {
    if (!events || !refs.isDrawing.current) return false;

    const activeLayer = state.layers.find((l) => l.id === state.activeLayerId);
    if (!activeLayer) return false;

    const lastEvent = events[events.length - 1];
    const currentCoords = actions.getCoords(
      lastEvent.clientX,
      lastEvent.clientY,
    );
    if (!currentCoords) return false;

    // Solo movemos la coordenada X e Y de la capa
    const deltaX = Math.round(currentCoords.x - startCoords.x);
    const deltaY = Math.round(currentCoords.y - startCoords.y);

    useAppStore
      .getState()
      .setLayerPosition(
        activeLayer.id,
        initialLayerPos.x + deltaX,
        initialLayerPos.y + deltaY,
      );

    // 🚀 Al retornar true, el motor ejecuta componerLienzo(true) a 60 FPS sin molestar a React
    return true;
  },
};
