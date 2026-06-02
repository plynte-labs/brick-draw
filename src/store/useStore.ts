// src/store/useStore.ts
import { create } from "zustand";
import { AppState } from "./types";
import { createUISlice } from "./slices/uiSlice";
import { createSettingsSlice } from "./slices/settingsSlice";
import { createLayerSlice } from "./slices/layerSlice";

// Detectamos el entorno una sola vez
export const IS_TAURI = !!(window as any).__TAURI_INTERNALS__;

// 🚀 Ensamblamos todas las rebanadas en un solo estado global poderoso
export const useAppStore = create<AppState>()((...a) => ({
  ...createUISlice(...a),
  ...createSettingsSlice(...a),
  ...createLayerSlice(...a),
}));
