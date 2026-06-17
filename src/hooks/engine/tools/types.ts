// src/hooks/engine/tools/types.ts
import { AppState } from "../../../store/types";

// Todo lo que una herramienta necesita saber para trabajar
export interface EngineContext {
  state: AppState;
  coords: { x: number; y: number };
  pressure: number;
  // Tipo de puntero del evento ('pen' | 'mouse' | 'touch'). Permite presión real con tableta y
  // ancho completo con mouse (que reporta 0.5). Vacío si no se conoce.
  pointerType: string;
  events?: PointerEvent[]; // Solo se usa al arrastrar el lápiz
  refs: {
    wetLayer: React.RefObject<OffscreenCanvas | null>;
    selectionMask: React.RefObject<OffscreenCanvas | null>;
    hasSelection: React.MutableRefObject<boolean>;
    isDrawing: React.MutableRefObject<boolean>;
    currentPoint: React.MutableRefObject<{ x: number; y: number }>;
    lastPoint: React.MutableRefObject<{ x: number; y: number }>;
    strokePoints: React.MutableRefObject<{ x: number; y: number; p: number }[]>;
  };
  actions: {
    prepararCache: () => void;
    componerLienzo: (isDrawing: boolean) => void;
    getCoords: (
      clientX: number,
      clientY: number,
    ) => { x: number; y: number } | null;
    setIsDrawing: (val: boolean) => void;
  };
}

// El contrato que toda herramienta debe cumplir
export interface DrawingToolStrategy {
  onPointerDown: (ctx: EngineContext) => Promise<void> | void;
  // Retorna `true` si la herramienta necesita que la pantalla se actualice (Render)
  onPointerMove: (ctx: EngineContext) => boolean | void;
}
