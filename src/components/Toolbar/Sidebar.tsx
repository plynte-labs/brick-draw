import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortablePanel } from '../Layout/SortablePanel';
import { usePanelDnD } from '../../hooks/usePanelDnD';

// 🚀 TUS COMPONENTES REALES
import { LayerPanel } from "./LayersPanel";
import { PropertySliders } from "./PropertySliders";
import { ToolSelector } from "./ToolSelector";

export const Sidebar = () => {
    const { sensors, handleDragEnd, panelOrder } = usePanelDnD();

    const renderPanel = (id: string) => {
        switch (id) {
            case 'tools':
                return (
                    <SortablePanel key={id} id={id} title="Herramientas">
                        <ToolSelector />
                    </SortablePanel>
                );
            case 'properties': // Asegúrate que este ID esté en tu store
                return (
                    <SortablePanel key={id} id={id} title="Propiedades">
                        <PropertySliders />
                    </SortablePanel>
                );
            case 'layers':
                return (
                    <SortablePanel key={id} id={id} title="Capas">
                        <LayerPanel />
                    </SortablePanel>
                );
            default:
                return null;
        }
    };

    return (
        // Ajustado a w-80 para que quepan bien los sliders y capas
        <aside className="w-80 bg-neutral-900 border-l border-neutral-800 h-full overflow-x-hidden p-4 overflow-y-auto shrink-0">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={panelOrder}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="flex flex-col gap-4">
                        {panelOrder.map(renderPanel)}
                    </div>
                </SortableContext>
            </DndContext>
        </aside>
    );
};