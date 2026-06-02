// src/components/Toolbar/LayerPanel.tsx
import React, { useState } from 'react';
import { useAppStore } from '../../store/useStore'; // Solo para acciones simples del Item
import { useLayerManager } from '../../hooks/useLayerManager';
import { FaEye, FaEyeSlash, FaPlus, FaLayerGroup, FaTrash, FaLock, FaLockOpen, FaGripVertical } from 'react-icons/fa';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- UI DE LA CAPA INDIVIDUAL ---
const SortableLayerItem = ({ layer }: { layer: any }) => {
    // Las acciones directas y simples pueden venir del store global
    const { toggleLayerLock, setLayerOpacity, renameLayer } = useAppStore();
    const activeLayerId = useAppStore((state) => state.activeLayerId);
    const setActiveLayer = useAppStore((state) => state.setActiveLayer);
    const toggleLayerVisibility = useAppStore((state) => state.toggleLayerVisibility);
    const removeLayer = useAppStore((state) => state.removeLayer);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: layer.id });

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
        <div ref={setNodeRef} style={style} onClick={() => setActiveLayer(layer.id)} className={`flex flex-col gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${activeLayerId === layer.id ? 'bg-sky-900/30 border-sky-500/50' : 'bg-neutral-800/50 border-transparent hover:bg-neutral-800'} ${layer.locked ? 'opacity-70 grayscale-[30%]' : ''}`}>
            {/* ... (Pega aquí exactamente el mismo contenido interno del SortableLayerItem que tenías antes) ... */}
            <div className="flex items-center gap-2">
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-neutral-600 hover:text-neutral-300 p-1 flex-shrink-0">
                    <FaGripVertical size={12} />
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }} className={`transition-colors cursor-pointer p-1 flex-shrink-0 ${layer.visible ? 'text-neutral-400 hover:text-white' : 'text-neutral-600'}`}>
                    {layer.visible ? <FaEye /> : <FaEyeSlash />}
                </button>
                <div className="w-8 h-8 bg-neutral-950 border border-neutral-700 rounded flex-shrink-0 flex items-center justify-center">
                    <span className="text-[8px] text-neutral-600 font-mono">IMG</span>
                </div>
                <div className="flex-1 cursor-text overflow-hidden ml-1">
                    {editingId === layer.id ? (
                        <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => submitRename(layer.id)} onKeyDown={(e) => e.key === 'Enter' && submitRename(layer.id)} className="w-full bg-neutral-950 text-sky-400 text-xs font-bold outline-none border border-sky-500 rounded px-1 py-0.5" />
                    ) : (
                        <span onDoubleClick={(e) => { if (!layer.locked) { e.stopPropagation(); setEditingId(layer.id); setEditName(layer.name); } }} className={`text-xs font-bold truncate block ${activeLayerId === layer.id ? 'text-sky-400' : 'text-neutral-300'}`}>
                            {layer.name}
                        </span>
                    )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }} className={`p-1 flex-shrink-0 cursor-pointer transition-colors ${layer.locked ? 'text-amber-500' : 'text-neutral-600 hover:text-neutral-400'}`}>
                    {layer.locked ? <FaLock size={10} /> : <FaLockOpen size={10} />}
                </button>
                {!layer.locked && (
                    <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }} className="opacity-0 cursor-pointer group-hover:opacity-100 transition-opacity p-1.5 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded flex-shrink-0">
                        <FaTrash className="text-[10px]" />
                    </button>
                )}
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))} disabled={layer.locked} className={`w-full h-1 cursor-grab rounded-full appearance-none ${layer.locked ? 'bg-neutral-800 cursor-not-allowed' : 'bg-neutral-900 accent-neutral-500'}`} />
                <span className="text-[10px] font-mono text-neutral-500 w-8 text-right">{Math.round(layer.opacity * 100)}%</span>
            </div>
        </div>
    );
};

// --- UI DEL PANEL PRINCIPAL ---
export const LayerPanel: React.FC = () => {
    // 🚀 INYECTAMOS EL CEREBRO AQUÍ
    const { layers, addLayer, sensors, handleDragEnd } = useLayerManager();

    return (
        <aside className="w-64 flex-shrink-0 h-fit bg-neutral-900 p-5 border-l border-neutral-800 flex flex-col gap-5 select-none shadow-2xl z-20">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div className="flex items-center gap-2 text-neutral-100">
                    <FaLayerGroup className="text-sky-500 text-lg" />
                    <h2 className="text-sm font-bold tracking-tight uppercase">Capas</h2>
                </div>
                <button onClick={addLayer} className="p-2 bg-neutral-800 cursor-pointer hover:bg-neutral-700 text-white rounded-lg transition-colors border border-neutral-700 hover:border-sky-500">
                    <FaPlus className="text-xs" />
                </button>
            </div>

            {/* Lista con Drag & Drop */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={layers.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex-1 flex flex-col gap-2 overflow-x-hidden overflow-y-auto custom-scrollbar">
                        {layers.map((layer) => (
                            <SortableLayerItem key={layer.id} layer={layer} />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </aside>
    );
};