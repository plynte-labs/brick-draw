// src/store/slices/settingsSlice.ts
import { AppSlice, SettingsSlice } from "../types";

export const createSettingsSlice: AppSlice<SettingsSlice> = (set, get) => ({
  settings: {
    tool: "brush",
    color: "#e8cdbb",
    size: 20,
    opacity: 1.0,
    smoothing: 0.95,
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
