// src/components/Toolbar/LayersPanel.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useStore';
import { useLayerManager } from '../../hooks/useLayerManager';
import { Layer } from '../../store/types';
import {
    FaEye,
    FaEyeSlash,
    FaPlus,
    FaTrash,
    FaLock,
    FaLockOpen,
    FaGripVertical,
} from 'react-icons/fa';
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- MINIATURA CON PREVIEW DIFERIDO (CADA X TIEMPO) ---
const LayerThumbnail: React.FC<{ layer: Layer }> = ({ layer }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const triggerRender = useAppStore((state) => state.triggerRender);

    const updatePreview = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !layer.buffer) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Fondo ajedrezado sutil para indicar transparencia
        const size = 4;
        for (let x = 0; x < canvas.width; x += size) {
            for (let y = 0; y < canvas.height; y += size) {
                ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#262626' : '#171717';
                ctx.fillRect(x, y, size, size);
            }
        }

        // Renderizado del buffer de la capa adaptado a la miniatura
        try {
            const srcW = layer.buffer.width;
            const srcH = layer.buffer.height;
            if (srcW > 0 && srcH > 0) {
                const scale = Math.min(canvas.width / srcW, canvas.height / srcH);
                const dw = Math.round(srcW * scale);
                const dh = Math.round(srcH * scale);
                const dx = Math.round((canvas.width - dw) / 2);
                const dy = Math.round((canvas.height - dh) / 2);
                ctx.drawImage(layer.buffer, dx, dy, dw, dh);
            }
        } catch {
            // Buffer en transición o no inicializado
        }
    }, [layer.buffer]);

    useEffect(() => {
        updatePreview();
        // Polling diferido cada 2.5s (no en tiempo real para proteger fps)
        const interval = setInterval(updatePreview, 2500);
        return () => clearInterval(interval);
    }, [updatePreview]);

    // Actualización adicional diferida (debounce de 1s) tras cambios/renders
    useEffect(() => {
        const timer = setTimeout(updatePreview, 1000);
        return () => clearTimeout(timer);
    }, [triggerRender, updatePreview]);

    return (
        <div className="w-8 h-8 rounded border border-neutral-700/80 bg-neutral-950 overflow-hidden flex-shrink-0 relative flex items-center justify-center shadow-inner">
            <canvas
                ref={canvasRef}
                width={32}
                height={32}
                className="w-full h-full block"
            />
        </div>
    );
};

// --- UI DE LA CAPA INDIVIDUAL ---
const SortableLayerItem = ({ layer }: { layer: Layer }) => {
    const { toggleLayerLock, setLayerOpacity, renameLayer } = useAppStore();
    const activeLayerId = useAppStore((state) => state.activeLayerId);
    const setActiveLayer = useAppStore((state) => state.setActiveLayer);
    const toggleLayerVisibility = useAppStore((state) => state.toggleLayerVisibility);
    const removeLayer = useAppStore((state) => state.removeLayer);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: layer.id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging ? 0.7 : 1,
    };

    const submitRename = (id: string) => {
        if (editName.trim().length > 0) renameLayer(id, editName);
        setEditingId(null);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => setActiveLayer(layer.id)}
            className={`w-full flex flex-col gap-2 p-2 rounded-lg border transition-all cursor-pointer group ${
                activeLayerId === layer.id
                    ? 'bg-sky-900/30 border-sky-500/50 shadow-sm'
                    : 'bg-neutral-800/50 border-neutral-800/80 hover:bg-neutral-800 hover:border-neutral-700'
            } ${layer.locked ? 'opacity-75 grayscale-[30%]' : ''}`}
        >
            <div className="flex items-center gap-1.5 w-full">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 p-1 flex-shrink-0"
                    title="Arrastrar para reordenar"
                >
                    <FaGripVertical size={11} />
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(layer.id);
                    }}
                    className={`transition-colors cursor-pointer p-1 flex-shrink-0 ${
                        layer.visible ? 'text-neutral-400 hover:text-white' : 'text-neutral-600'
                    }`}
                    title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                >
                    {layer.visible ? <FaEye size={13} /> : <FaEyeSlash size={13} />}
                </button>

                <LayerThumbnail layer={layer} />

                <div className="flex-1 min-w-0 cursor-text overflow-hidden px-1">
                    {editingId === layer.id ? (
                        <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => submitRename(layer.id)}
                            onKeyDown={(e) => e.key === 'Enter' && submitRename(layer.id)}
                            className="w-full bg-neutral-950 text-sky-400 text-xs font-bold outline-none border border-sky-500 rounded px-1.5 py-0.5"
                        />
                    ) : (
                        <span
                            onDoubleClick={(e) => {
                                if (!layer.locked) {
                                    e.stopPropagation();
                                    setEditingId(layer.id);
                                    setEditName(layer.name);
                                }
                            }}
                            className={`text-xs font-semibold truncate block select-none ${
                                activeLayerId === layer.id ? 'text-sky-400' : 'text-neutral-300'
                            }`}
                            title={`${layer.name} (Doble clic para renombrar)`}
                        >
                            {layer.name}
                        </span>
                    )}
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.id);
                    }}
                    className={`p-1 flex-shrink-0 cursor-pointer transition-colors ${
                        layer.locked ? 'text-amber-500' : 'text-neutral-600 hover:text-neutral-400'
                    }`}
                    title={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
                >
                    {layer.locked ? <FaLock size={10} /> : <FaLockOpen size={10} />}
                </button>

                {!layer.locked && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            removeLayer(layer.id);
                        }}
                        className="opacity-0 cursor-pointer group-hover:opacity-100 transition-opacity p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded flex-shrink-0"
                        title="Eliminar capa"
                    >
                        <FaTrash className="text-[10px]" />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2 pl-6 pr-1" onClick={(e) => e.stopPropagation()}>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={layer.opacity}
                    onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))}
                    disabled={layer.locked}
                    className={`w-full h-1 cursor-grab rounded-full appearance-none ${
                        layer.locked ? 'bg-neutral-800 cursor-not-allowed' : 'bg-neutral-700 accent-sky-500'
                    }`}
                />
                <span className="text-[10px] font-mono text-neutral-400 w-7 text-right flex-shrink-0">
                    {Math.round(layer.opacity * 100)}%
                </span>
            </div>
        </div>
    );
};

// --- UI DEL PANEL PRINCIPAL ---
export const LayerPanel: React.FC = () => {
    const { layers, addLayer, sensors, handleDragEnd } = useLayerManager();

    return (
        <div className="w-full h-full flex flex-col gap-2.5 select-none min-h-0 flex-1">
            {/* Cabecera / Acción rápida */}
            <div className="flex items-center justify-between pb-1 px-0.5 flex-shrink-0">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {layers.length} {layers.length === 1 ? 'capa' : 'capas'}
                </span>
                <button
                    onClick={addLayer}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-sky-400 hover:text-white rounded-md text-xs font-semibold transition-all border border-neutral-700 hover:border-sky-500/50 shadow-sm cursor-pointer"
                    title="Crear nueva capa"
                >
                    <FaPlus className="text-[10px]" />
                    <span>Nueva Capa</span>
                </button>
            </div>

            {/* Lista con Drag & Drop adaptada a la altura completa */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                    <div className="w-full flex-1 min-h-0 flex flex-col gap-2 overflow-x-hidden overflow-y-auto custom-scrollbar pr-1">
                        {layers.map((layer) => (
                            <SortableLayerItem key={layer.id} layer={layer} />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
};