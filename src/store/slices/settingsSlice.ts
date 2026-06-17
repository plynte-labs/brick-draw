// src/store/slices/settingsSlice.ts
import { AppSlice, SettingsSlice } from "../types";

export const createSettingsSlice: AppSlice<SettingsSlice> = (set, get) => ({
  settings: {
    tool: "brush",
    color: "#e8cdbb",
    size: 20,
    opacity: 1.0,
    // Estabilización por defecto MODERADA. Antes era 0.95 (lag extremo: el trazo se arrastraba muy
    // atrás del cursor y la goma "cortaba a la mitad"). 0.5 suaviza sin desconectar del cursor;
    // subíse a 0.95 en el slider "Suavizado" para entintado, o bajá a 0 para precisión total.
    smoothing: 0.5,
  },
  keybinds: {
    undo: "ctrl+z",
    redo: "ctrl+y",
    brush: "b",
    eraser: "e",
  },
  modifiers: { shift: false, ctrl: false },

  setSettings: (newSettings) => {
    set((state) => ({ settings: { ...state.settings, ...newSettings } }));
    get().forceRender();
  },

  setModifiers: (mods) =>
    set((state) => ({
      modifiers: { ...state.modifiers, ...mods },
    })),
});
