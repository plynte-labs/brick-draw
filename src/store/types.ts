// src/store/types.ts
import { StateCreator } from "zustand";
import { PressureCurvePreset } from "../hooks/engine/pressureCurve";

export type DrawingTool = "brush" | "eraser" | "wand" | "move" | "transform";

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  buffer: OffscreenCanvas;
  x: number;
  y: number;
}

export interface BrushSettings {
  tool: DrawingTool;
  color: string;
  size: number; 
  opacity: number;
  smoothing: number;
  // Curva de respuesta de presión del lápiz: cómo la fuerza real del stylus
  // (tras resolvePressure) se traduce en grosor. "linear" = identidad.
  pressureCurve: PressureCurvePreset;
}

export interface Keybinds {
  undo: string;
  redo: string;
  brush: string;
  eraser: string;
}

// ==========================================
// 🍕 REBANADAS (SLICES)
// ==========================================

export interface UISlice {
  isLayerPanelOpen: boolean;
  triggerRender: number;
  isCanvasInitialized: boolean;
  canvasSize: { width: number; height: number };
  camera: { x: number; y: number; zoom: number };
  setCamera: (cam: Partial<{ x: number; y: number; zoom: number }>) => void;
  resetCamera: (w?: number, h?: number) => void;
  panelOrder: string[];
  setPanelOrder: (newOrder: string[]) => void;

  toggleLayerPanel: () => void;
  forceRender: () => void;
  initCanvas: (width: number, height: number) => void;

  // 🚀 NUEVO: Estados de carga globales para prevenir UI-freeze visual
  isLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  setLoading: (loading: boolean, message?: string, progress?: number) => void;
}

export interface SettingsSlice {
  settings: BrushSettings;
  keybinds: Keybinds;
  modifiers: { shift: boolean; ctrl: boolean };
  setSettings: (newSettings: Partial<BrushSettings>) => void;
  setModifiers: (mods: Partial<{ shift: boolean; ctrl: boolean }>) => void;
}

export interface LayerSlice {
  layers: Layer[];
  activeLayerId: string | null;
  addLayer: () => void;
  setActiveLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  clearSelection: () => Promise<void>;
  setLayerOpacity: (id: string, opacity: number) => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, newName: string) => void;
  setLayers: (layers: Layer[]) => void;
  setLayerPosition: (id: string, x: number, y: number) => void;
  saveProject: (path: string) => Promise<boolean>;
  loadProject: (path: string) => Promise<boolean>;
}

// Interfaz principal que une todas las rebanadas
export type AppState = UISlice & SettingsSlice & LayerSlice;

// Helper para tipar correctamente cada rebanada individual
export type AppSlice<T> = StateCreator<AppState, [], [], T>;
