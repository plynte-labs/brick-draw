// src/components/Toolbar/AIPromptModal.tsx
import { useState } from "react";
import { useAppStore } from "../../store/useStore";
import { generarImagenIA } from "../../services/aiService";
import { FaMagic, FaTimes, FaSpinner } from "react-icons/fa";
import { anadirCapa, cargarPngEnCapa } from "../../services/tauriService";

interface Props {
    onClose: () => void;
}

export const AIPromptModal = ({ onClose }: Props) => {
    // 🚀 FIX: Traemos el tamaño dinámico del lienzo
    const { forceRender, canvasSize } = useAppStore();

    const [prompt, setPrompt] = useState("");
    const [strength, setStrength] = useState(0.65);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsGenerating(true);

        try {
            const imageBlob = await generarImagenIA(prompt, strength);
            const imgBitmap = await createImageBitmap(imageBlob);
            console.log(`prompt: ${prompt} \n strength: ${strength}`);
            const nuevoId = `layer-ia-${Date.now()}`;
            // 🚀 FIX: Le pasamos el ancho y alto a Rust para que reserve bien la memoria
            const resAnadir = await anadirCapa(nuevoId, canvasSize.width, canvasSize.height);
            if (!resAnadir.success) throw new Error(resAnadir.error);

            const store = useAppStore.getState();
            store.setLayers([
                ...store.layers,
                {
                    id: nuevoId,
                    name: `AI: ${prompt.substring(0, 8)}...`,
                    visible: true,
                    opacity: 1.0,
                    buffer: new OffscreenCanvas(canvasSize.width, canvasSize.height),
                    locked: false,
                    x: 0,
                    y: 0
                }
            ]);

            store.setActiveLayer(nuevoId);

            const updatedStore = useAppStore.getState();
            const nuevaCapa = updatedStore.layers.find((l) => l.id === nuevoId);

            if (nuevaCapa) {
                const ctx = nuevaCapa.buffer.getContext("2d");
                if (ctx) {
                    // 🚀 FIX: Estiramos la imagen a las proporciones correctas elegidas por el usuario
                    ctx.drawImage(imgBitmap, 0, 0, canvasSize.width, canvasSize.height);

                    const canvasBlob = await nuevaCapa.buffer.convertToBlob({ type: "image/png" });
                    const arrayBuffer = await canvasBlob.arrayBuffer();
                    const bytesArray = new Uint8Array(arrayBuffer);

                    const resCargar = await cargarPngEnCapa(nuevoId, bytesArray);
                    if (!resCargar.success) throw new Error(resCargar.error);

                    forceRender();
                    onClose();
                }
            }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            alert(`Error generating AI image:\n\n${errorMsg}\n\nCheck the Python server terminal for details.`);
            console.error("Error en generación de IA:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 w-[500px] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Cabecera */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950">
                    <h2 className="text-sky-400 font-bold tracking-widest flex items-center gap-2">
                        <FaMagic /> EXTERNAL AI
                    </h2>
                    <button onClick={onClose} className="text-neutral-500 cursor-pointer hover:text-white transition-colors">
                        <FaTimes />
                    </button>
                </div>

                {/* Cuerpo */}
                <div className="p-6 flex flex-col gap-6">
                    <div>
                        <label className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-2 block">
                            Prompt (Instruction)
                        </label>
                        <textarea
                            className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm text-neutral-200 focus:outline-none focus:border-sky-500 resize-y max-h-104"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe what you want to generate..."
                        />
                        <p className="text-[10px] text-neutral-500 mt-2">
                            Uses the optional AI server configured through <code>VITE_AI_SERVER_URL</code>.
                        </p>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-mono text-neutral-400 uppercase tracking-widest">
                                Strength (AI Creativity)
                            </label>
                            <span className="text-sky-400 font-mono text-xs">{strength.toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={strength}
                            onChange={(e) => setStrength(parseFloat(e.target.value))}
                            className="w-full accent-sky-500 cursor-grab"
                        />
                        <p className="text-[10px] text-neutral-500 mt-2">
                            0.1 = Almost unchanged | 0.9 = Completely redraws your sketch.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800 flex justify-end">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg cursor-pointer font-bold tracking-wider transition-all ${isGenerating
                            ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                            : "bg-sky-600 hover:bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]"
                            }`}
                    >
                        {isGenerating ? (
                            <><FaSpinner className="animate-spin" /> PROCESSING...</>
                        ) : (
                            <><FaMagic /> GENERATE</>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
};
