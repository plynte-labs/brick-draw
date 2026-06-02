// src/App.tsx
import { useAppStore } from "./store/useStore";
import { CanvasSetupModal } from './components/CanvasSetupModal';
import { EditorWorkspace } from "./components/Layout/EditorWorkspace";
import { useRustSync } from "./hooks/useRustSync";
import { useHotkeys } from "./hooks/useHotkeys";
import { openFileDialog } from "./services/tauriService";
import "./css/App.css";

function App() {
    const { isCanvasInitialized, initCanvas, loadProject, isLoading, loadingMessage, loadingProgress } = useAppStore();

    // Escucha atajos de teclado a nivel global
    useHotkeys();

    // Sincroniza con Rust silenciosamente en segundo plano
    useRustSync();

    const handleImportProject = async () => {
        try {
            const resOpen = await openFileDialog({
                title: 'Abrir Proyecto de Capas',
                filters: [{ name: 'Proyecto Brick-Draw', extensions: ['brick'] }]
            });

            if (!resOpen.success || !resOpen.data) return;

            const success = await loadProject(resOpen.data);
            if (success) {
                console.log("¡Proyecto .brick importado con éxito al inicio!");
            }
        } catch (error) {
            console.error("Error al importar el proyecto al inicio:", error);
            alert("Hubo un error al abrir el proyecto: " + error);
        }
    };

    return (
        <div className="w-screen h-screen bg-neutral-950 relative overflow-hidden">
            {!isCanvasInitialized ? (
                <CanvasSetupModal 
                    onStart={(size) => initCanvas(size.width, size.height)} 
                    onImport={handleImportProject}
                />
            ) : (
                <EditorWorkspace />
            )}

            {/* Pantalla de carga global (Glassmorphism & Gaming AAA Aesthetics) */}
            {isLoading && (
                <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
                    <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-6 w-96 shadow-[0_0_40px_rgba(14,165,233,0.15)] flex flex-col gap-4 relative overflow-hidden backdrop-blur-md">
                        {/* Línea superior neón con animación pulsante */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500 shadow-[0_1px_10px_rgba(14,165,233,0.5)]"></div>
                        
                        <div className="flex items-center justify-between text-[10px] font-mono text-sky-400 font-bold uppercase tracking-widest">
                            <span>PROCESANDO PROYECTO .BRICK</span>
                            <span className="bg-sky-950 text-sky-400 border border-sky-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                {loadingProgress}%
                            </span>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-mono text-neutral-300 truncate">
                                {loadingMessage}
                            </span>
                            
                            {/* Contenedor de la barra de progreso */}
                            <div className="h-2 bg-neutral-950 rounded-full border border-neutral-800 overflow-hidden relative">
                                <div 
                                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(14,165,233,0.4)]"
                                    style={{ width: `${loadingProgress}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="text-[9px] font-mono text-neutral-500 text-right uppercase tracking-widest">
                            Por favor, no cierres la aplicación
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;