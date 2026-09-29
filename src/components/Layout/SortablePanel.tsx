import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortablePanelProps {
    id: string;
    title: string;
    children: React.ReactNode;
    isFlexible?: boolean;
}

export const SortablePanel = ({ id, title, children, isFlexible = false }: SortablePanelProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        // Efecto visual cuando se está arrastrando
        opacity: isDragging ? 0.4 : 1,
        scale: isDragging ? 0.98 : 1,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col ${
                isFlexible ? 'flex-1 min-h-0' : 'shrink-0'
            }`}
        >
            <div
                {...attributes}
                {...listeners}
                className="bg-neutral-800/50 px-3 py-2 cursor-grab active:cursor-grabbing border-b border-neutral-800 flex items-center justify-between flex-shrink-0"
            >
                <span className="text-xs font-bold text-neutral-400 tracking-wider">
                    {title.toUpperCase()}
                </span>
                <span className="text-neutral-500">⠿</span>
            </div>

            {/* El contenido real del panel (Botones, Sliders, Capas) */}
            <div className={`p-2 ${isFlexible ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : ''}`}>
                {children}
            </div>
        </div>
    );
};