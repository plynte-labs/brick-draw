// src/components/Layout/EditorWorkspace.tsx
import { useAppStore } from "../../store/useStore";
import Toolbar from "../Toolbar/Toolbar";
import { DrawingCanvas } from "../DrawingCanvas";
import { Sidebar } from "../Toolbar/Sidebar";
import { StatusBar } from "../Toolbar/StatusBar";
import { AIPromptModal } from "../Toolbar/AIPromptModal";

export const EditorWorkspace = () => {
    const isLayerPanelOpen = useAppStore((state) => state.isLayerPanelOpen);
    const isAIModalOpen = useAppStore((state) => state.isAIModalOpen);
    const setIsAIModalOpen = useAppStore((state) => state.setIsAIModalOpen);

    return (
        <main className="flex flex-col w-full h-full overflow-hidden bg-neutral-950 text-neutral-100 font-sans select-none relative">
            <div className="flex flex-1 overflow-hidden relative">
                {/* Panel Izquierdo (Propiedades y Exportación) */}
                <Toolbar />

                {/* Lienzo Central */}
                <section className="flex-1 flex flex-col min-w-0 bg-neutral-900 overflow-hidden relative">
                    <DrawingCanvas />
                </section>

                {/* Panel Derecho Modularizado (Capas y Herramientas secundarias) */}
                {isLayerPanelOpen && <Sidebar />}
            </div>

            <StatusBar />
            {isAIModalOpen && <AIPromptModal onClose={() => setIsAIModalOpen(false)} />}
        </main>
    );
};