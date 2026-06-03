// src/components/Toolbar/ToolSelector.tsx
import React from 'react';
import { FaBrush, FaEraser, FaMagic, FaArrowsAlt, FaTimesCircle } from 'react-icons/fa';
import { useAppStore } from '../../store/useStore';
import { DrawingTool } from '../../store/types';

const tools: { id: DrawingTool; name: string; icon: any }[] = [
    { id: 'brush', name: 'Brush', icon: FaBrush },
    { id: 'eraser', name: 'Eraser', icon: FaEraser },
    { id: 'wand', name: 'Wand', icon: FaMagic },
    { id: 'move', name: 'Move', icon: FaArrowsAlt },
];

export const ToolSelector: React.FC = () => {
    // 🚀 Usamos selectores atómicos para el rendimiento
    const settings = useAppStore((state) => state.settings);
    const setSettings = useAppStore((state) => state.setSettings);

    const handleDeselect = () => {
        // Disparamos el evento de teclado para que lo atrape tu listener global
        window.dispatchEvent(
            new KeyboardEvent("keydown", { ctrlKey: true, key: "d" })
        );
    };

    return (
        <section className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Mode</h3>

            <div className="grid grid-cols-2 gap-2.5">
                {tools.map(tool => (
                    <button
                        key={tool.id}
                        onClick={() => setSettings({ tool: tool.id })}
                        className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-150 cursor-pointer ${settings.tool === tool.id
                                ? 'bg-sky-600 border-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)] scale-105'
                                : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700/50 text-neutral-400'
                            }`}
                    >
                        <tool.icon className="text-xl" />
                        <span className="text-[10px] font-bold uppercase">{tool.name}</span>
                    </button>
                ))}
            </div>

            {/* 🚀 BOTÓN CONTEXTUAL: Solo aparece si estamos usando Varita o Mover */}
            {(settings.tool === 'wand' || settings.tool === 'move') && (
                <button
                    onClick={handleDeselect}
                    className="flex items-center justify-center gap-2 p-2 mt-1 rounded-lg bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/40 transition-colors"
                >
                    <FaTimesCircle />
                    {/* 🚀 Añadido el atajo visual (Ctrl+D) */}
                    <span className="text-[10px] cursor-pointer font-bold uppercase tracking-wider">
                        Deselect <span className="opacity-70">(Ctrl+D)</span>
                    </span>
                </button>
            )}
        </section>
    );
};