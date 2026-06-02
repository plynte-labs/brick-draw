// src/components/Layout/EditorWorkspace.tsx
import { useState } from "react";
import { useAppStore } from "../../store/useStore";
import Toolbar from "../Toolbar/Toolbar";
import { DrawingCanvas } from "../DrawingCanvas";
import { Sidebar } from "../Toolbar/Sidebar"; // 🚀 Importamos el nuevo componente modular
import { StatusBar } from "../Toolbar/StatusBar";
import { AIPromptModal } from "../Toolbar/AIPromptModal";
import { FaLayerGroup, FaMagic } from "react-icons/fa";

export const EditorWorkspace = () => {
    const { isLayerPanelOpen, toggleLayerPanel } = useAppStore();
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);

    return (
        <main className="flex flex-col w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans select-none relative">
            <div className="flex flex-1 overflow-hidden relative">
                {/* Panel Izquierdo (Herramientas Principales) */}
                <Toolbar />

                {/* Lienzo Central */}
                <section className="flex-1 flex flex-col min-w-0 bg-neutral-900">
                    <header className="shrink-0 h-12 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between px-6 shadow-sm z-10">
                        <div className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                            Brick.draw
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsAIModalOpen(true)}
                                className="flex items-center cursor-pointer gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors bg-sky-900/40 text-sky-400 hover:bg-sky-800/60 border border-sky-800/50 shadow-[0_0_10px_rgba(14,165,233,0.15)]"
                            >
                                <FaMagic className="text-sm" /> IA Engine
                            </button>

                            <button
                                onClick={toggleLayerPanel}
                                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${isLayerPanelOpen
                                    ? "bg-neutral-700 text-white shadow-md"
                                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                                    }`}
                            >
                                <FaLayerGroup className="text-sm" /> Paneles
                            </button>
                        </div>
                    </header>

                    <div className="flex-1 w-full h-full overflow-hidden relative bg-neutral-900">
                        <DrawingCanvas />
                    </div>
                </section>

                {/* 🚀 Panel Derecho Modularizado (Se renderiza si isLayerPanelOpen es true) */}
                {isLayerPanelOpen && <Sidebar />}
            </div>

            <StatusBar />
            {isAIModalOpen && <AIPromptModal onClose={() => setIsAIModalOpen(false)} />}
        </main>
    );
};