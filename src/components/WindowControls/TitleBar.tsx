import React from "react";
import {
  FaBrush,
  FaEraser,
  FaMagic,
  FaArrowsAlt,
  FaExpand,
  FaTimesCircle,
  FaLayerGroup,
} from "react-icons/fa";
import { useAppStore } from "../../store/useStore";
import { DrawingTool } from "../../store/types";
import { WindowControls } from "./WindowControls";

const tools: {
  id: DrawingTool;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
}[] = [
  { id: "brush", name: "Brush", icon: FaBrush, shortcut: "B" },
  { id: "eraser", name: "Eraser", icon: FaEraser, shortcut: "E" },
  { id: "wand", name: "Wand", icon: FaMagic, shortcut: "W" },
  { id: "move", name: "Move", icon: FaArrowsAlt, shortcut: "M" },
  { id: "transform", name: "Transform", icon: FaExpand, shortcut: "" },
];

export const TitleBar: React.FC = () => {
  const isCanvasInitialized = useAppStore((state) => state.isCanvasInitialized);
  const isLayerPanelOpen = useAppStore((state) => state.isLayerPanelOpen);
  const toggleLayerPanel = useAppStore((state) => state.toggleLayerPanel);
  const setIsAIModalOpen = useAppStore((state) => state.setIsAIModalOpen);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  const handleDeselect = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { ctrlKey: true, key: "d" })
    );
  };

  return (
    <header
      data-tauri-drag-region
      className="app-titlebar h-12 w-full bg-neutral-900 border-b border-neutral-800 flex items-center justify-between select-none shrink-0 z-50 text-neutral-300"
    >
      {/* Sección Izquierda: Branding BRICK.DRAW */}
      <div data-tauri-drag-region className="flex items-center gap-3 px-4 h-full shrink-0">
        <span
          data-tauri-drag-region
          className="text-xs font-mono text-neutral-500 uppercase tracking-widest font-bold"
        >
          BRICK.DRAW
        </span>
      </div>

      {/* Espaciador de arrastre izquierdo */}
      <div data-tauri-drag-region className="flex-1 h-full min-w-3" />

      {/* Sección Central: Herramientas (BRUSH, ERASER, WAND, MOVE, TRANSFORM) */}
      {isCanvasInitialized && (
        <div className="flex items-center gap-1.5 px-2 shrink-0">
          {tools.map((tool) => {
            const isActive = settings.tool === tool.id;
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setSettings({ tool: tool.id })}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                  isActive
                    ? "bg-sky-600 border-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.35)] scale-102"
                    : "bg-neutral-800/80 border-neutral-700/60 hover:bg-neutral-700/70 text-neutral-400 hover:text-neutral-200"
                }`}
                title={tool.shortcut ? `${tool.name} (${tool.shortcut})` : tool.name}
              >
                <Icon className="text-xs shrink-0" />
                <span>{tool.name}</span>
              </button>
            );
          })}

          {(settings.tool === "wand" || settings.tool === "move") && (
            <button
              type="button"
              onClick={handleDeselect}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/40 text-[10px] font-bold uppercase tracking-wider transition-colors ml-1 cursor-pointer"
              title="Deselect (Ctrl+D)"
            >
              <FaTimesCircle className="text-xs" />
              <span className="hidden md:inline">Deselect (Ctrl+D)</span>
            </button>
          )}
        </div>
      )}

      {/* Espaciador de arrastre derecho */}
      <div data-tauri-drag-region className="flex-1 h-full min-w-3" />

      {/* Sección Derecha: IA Engine + Paneles + Controles de Ventana */}
      <div className="flex items-center h-full shrink-0 gap-3">
        {isCanvasInitialized && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAIModalOpen(true)}
              className="flex items-center cursor-pointer gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors bg-sky-900/40 text-sky-400 hover:bg-sky-800/60 border border-sky-800/50 shadow-[0_0_10px_rgba(14,165,233,0.15)]"
            >
              <FaMagic className="text-sm" /> IA Engine
            </button>

            <button
              type="button"
              onClick={toggleLayerPanel}
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isLayerPanelOpen
                  ? "bg-neutral-700 text-white shadow-md border border-neutral-600"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 border border-neutral-700/50"
              }`}
            >
              <FaLayerGroup className="text-sm" /> Paneles
            </button>
          </div>
        )}

        {/* Controles nativos Windows 11 */}
        <WindowControls />
      </div>
    </header>
  );
};

export default TitleBar;
