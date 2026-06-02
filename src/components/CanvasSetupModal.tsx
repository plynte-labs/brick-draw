// src/components/CanvasSetupModal.tsx
import React, { useState } from 'react';
import { FaImage, FaMobileAlt, FaExpandArrowsAlt, FaCheck, FaFolderOpen, FaGithub } from 'react-icons/fa';

interface CanvasSize {
    width: number;
    height: number;
}

interface Props {
    onStart: (size: CanvasSize) => void;
    onImport: () => void;
}

const PRESETS = [
    { id: 'horizontal', name: 'Post Horizontal', width: 1080, height: 608, ratio: '1.91:1', icon: <FaMobileAlt className='rotate-90'/> },
    { id: 'vertical-classic', name: 'Post Vertical (Clásico)', width: 1080, height: 1350, ratio: '4:5', icon: <FaMobileAlt /> },
    { id: 'vertical-new', name: 'Post Vertical (Nuevo)', width: 1080, height: 1440, ratio: '3:4', icon: <FaMobileAlt /> },
    { id: 'stories', name: 'Stories / Reels', width: 1080, height: 1920, ratio: '9:16', icon: <FaMobileAlt /> },
];

export const CanvasSetupModal: React.FC<Props> = ({ onStart, onImport }) => {
    const [selectedId, setSelectedId] = useState<string>('vertical-new');
    const [customWidth, setCustomWidth] = useState<number | string>(1080);
    const [customHeight, setCustomHeight] = useState<number | string>(1080);

    const MAX_DIMENSION = 3840;
    const MIN_DIMENSION = 100;

    const handleStart = () => {
        if (selectedId === 'custom') {
            let width = Number(customWidth);
            let height = Number(customHeight);

            if (isNaN(width) || width < MIN_DIMENSION) width = 1080;
            if (isNaN(height) || height < MIN_DIMENSION) height = 1080;

            width = Math.min(width, MAX_DIMENSION);
            height = Math.min(height, MAX_DIMENSION);

            setCustomWidth(width);
            setCustomHeight(height);

            onStart({
                width: width,
                height: height
            });
        } else {
            const preset = PRESETS.find(p => p.id === selectedId);
            if (preset) onStart({ width: preset.width, height: preset.height });
        }
    };

    return (
        <div className="fixed inset-0 z-[1] flex items-center justify-center bg-black/90 backdrop-blur-md overflow-hidden">

            {/* --- FONDO DECORATIVO --- */}
            {/* Círculo Azul Superior Izquierdo */}
            <div className="absolute z-0 -top-32 -left-32 w-[500px] h-[500px] bg-sky-800/20 rounded-full blur-[120px] pointer-events-none"></div>

            {/* Círculo Azul Inferior Derecho */}
            <div className="absolute z-0 -bottom-40 -right-40 w-[600px] h-[600px] bg-blue-700/20 rounded-full blur-[150px] pointer-events-none"></div>

            <div className="absolute z-0 -top-40 -right-0 w-[500px] h-[500px] bg-purple-800/20 rounded-full blur-[130px] pointer-events-none"></div>
            
            {/* Texto Gigante Decorativo Repetido (Patrón Tapiz) */}
            <div className="absolute inset-[-50%] flex flex-col-reverse items-center justify-center pointer-events-none select-none z-[3] rotate-[-3deg]">
                {/* Creamos 20 filas hacia abajo */}
                {[...Array(20)].map((_, rowIndex) => (
                    <div
                        key={rowIndex}
                        className={`flex whitespace-nowrap gap-4 mb-1 ${
                            // Condición: Si la fila es par, se desplaza a la izquierda. Si es impar, a la derecha.
                            rowIndex % 2 === 0 ? '-translate-x-[12vw]' : 'translate-x-[4vw]'
                            }`}
                    >
                        {/* Repetimos el patrón de palabras 6 veces por fila */}
                        {[...Array(6)].map((_, colIndex) => (
                            <React.Fragment key={colIndex}>
                                <span className="text-sky-500/[0.01] font-black text-[3vw] leading-none blur-[2px]">
                                    LEARN
                                </span>
                                <span className="text-sky-500/[0.01] font-black text-[3vw] leading-none blur-[2px]">
                                    THINK
                                </span>
                                <span className="text-sky-500/[0.01] font-black text-[3vw] leading-none blur-[2px]">
                                    BUILD
                                </span>
                                <span className="text-sky-500/[0.01] font-black text-[3vw] leading-none blur-[2px]">
                                    DRAW
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                ))}
            </div>
            {/* -------------------------------------- */}

            {/* Modal Principal (Se le añade relative y z-10 para estar sobre el fondo) */}
            <div className="relative z-10 bg-neutral-950 border border-neutral-700 w-[600px] rounded-2xl flex flex-col overflow-hidden shadow-[0px_50px_900px_rgba(0,0,0,0.8)]">

                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-neutral-800 bg-neutral-950">
                    <h2 className="text-xl text-sky-400 font-bold tracking-widest flex items-center gap-3">
                        <FaExpandArrowsAlt /> NUEVO LIENZO
                    </h2>
                    <p className="text-sm text-neutral-400 mt-1">
                        Selecciona las dimensiones para tu nueva obra de arte.
                    </p>
                </div>

                {/* Cuerpo */}
                <div className="p-6">
                    <div className="grid grid-cols-2 gap-3">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                onClick={() => setSelectedId(preset.id)}
                                className={`flex flex-row items-center gap-3 p-6 rounded-xl border transition-all text-left cursor-pointer ${selectedId === preset.id
                                    ? 'bg-sky-900/20 border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                                    : 'bg-neutral-800/50 border-transparent hover:bg-neutral-800'
                                    }`}
                            >
                                <div className={`text-3xl mb-0 ${selectedId === preset.id ? 'text-sky-400' : 'text-neutral-500'}`}>
                                    {preset.icon}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`font-bold ${selectedId === preset.id ? 'text-sky-400' : 'text-neutral-200'}`}>{preset.name}</span>
                                    <span className="text-xs text-neutral-500 font-mono mt-1">
                                        {preset.width} x {preset.height} px ({preset.ratio})
                                    </span>
                                </div>
                            </button>
                        ))}

                        {/* Opción Personalizada */}
                        <div
                            onClick={() => setSelectedId('custom')}
                            className={`flex flex-row items-center gap-4 p-6 rounded-xl border transition-all text-left cursor-pointer ${selectedId === 'custom'
                                    ? 'bg-sky-900/20 border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
                                    : 'bg-neutral-800/50 border-transparent hover:bg-neutral-800'
                                }`}
                        >
                            {/* Columna Izquierda: Icono */}
                            <div className={`text-2xl ${selectedId === 'custom' ? 'text-sky-400' : 'text-neutral-500'}`}>
                                <FaImage />
                            </div>

                            {/* Columna Derecha: Título e Inputs */}
                            <div className="flex flex-col w-full">
                                <span className={`font-bold ${selectedId === 'custom' ? 'text-sky-400' : 'text-neutral-200'} mb-1`}>
                                    Personalizado
                                </span>

                                <div className="flex items-center gap-3 w-full">
                                    {/* Input Ancho */}
                                    <div className="flex-1">
                                        <label className="text-[10px] text-neutral-500 font-bold tracking-widest block mb-1">
                                            ANCHO (PX)
                                        </label>
                                        <input
                                            type="number"
                                            value={customWidth}
                                            onChange={(e) => setCustomWidth(e.target.value)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedId('custom');
                                            }}
                                            max={MAX_DIMENSION}
                                            min={MIN_DIMENSION}
                                            disabled={selectedId !== 'custom'}
                                            className="w-full bg-neutral-900/80 border border-neutral-700/50 rounded-lg px-3 py-1.5 text-sm text-white focus:border-sky-500 focus:bg-neutral-950 focus:shadow-[0_0_10px_rgba(14,165,233,0.1)] outline-none transition-all disabled:opacity-40"
                                        />
                                    </div>

                                    {/* Separador */}
                                    <span className="text-neutral-600 font-bold mt-4">×</span>

                                    {/* Input Alto */}
                                    <div className="flex-1">
                                        <label className="text-[10px] text-neutral-500 font-bold tracking-widest block mb-1">
                                            ALTO (PX)
                                        </label>
                                        <input
                                            type="number"
                                            value={customHeight}
                                            onChange={(e) => setCustomHeight(e.target.value)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedId('custom');
                                            }}
                                            max={MAX_DIMENSION}
                                            min={MIN_DIMENSION}
                                            disabled={selectedId !== 'custom'}
                                            className="w-full bg-neutral-900/80 border border-neutral-700/50 rounded-lg px-3 py-1.5 text-sm text-white focus:border-sky-500 focus:bg-neutral-950 focus:shadow-[0_0_10px_rgba(14,165,233,0.1)] outline-none transition-all disabled:opacity-40"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center">
                    {/* Botón Importar Proyecto (.brick) directamente al abrir */}
                    <button
                        onClick={onImport}
                        className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-sky-500 hover:bg-sky-950/20 text-sky-400 rounded-lg font-bold tracking-wider cursor-pointer transition-all duration-300 text-xs uppercase"
                    >
                        <FaFolderOpen /> ABRIR PROYECTO (.brick)
                    </button>

                    <button
                        onClick={handleStart}
                        className="flex items-center gap-2 px-8 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold tracking-wider cursor-pointer transition-all shadow-[0_0_15px_rgba(14,165,233,0.4)]"
                    >
                        <FaCheck /> CREAR LIENZO
                    </button>
                </div>
            </div>

            {/* Créditos en la esquina inferior derecha */}
            <div className="absolute bottom-6 right-6 z-[10] flex items-center gap-2 text-neutral-500 text-xs font-mono select-none">
                <span>brick.draw by</span>
                <a 
                    href="https://github.com/franguh" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-bold transition-colors"
                >
                    <FaGithub className="text-sm" /> @franguh
                </a>
            </div>
        </div>
    );
};