import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortablePanel } from '../Layout/SortablePanel';
import { usePanelDnD } from '../../hooks/usePanelDnD';

import { LayerPanel } from "./LayersPanel";
import { PropertySliders } from "./PropertySliders";

export const Sidebar = () => {
    const { sensors, handleDragEnd, panelOrder } = usePanelDnD();
    const activePanels = panelOrder.filter((id) => id !== 'tools');

    const renderPanel = (id: string) => {
        switch (id) {
            case 'properties':
                return (
                    <SortablePanel key={id} id={id} title="Propiedades">
                        <PropertySliders />
                    </SortablePanel>
                );
            case 'layers':
                return (
                    <SortablePanel key={id} id={id} title="Capas" isFlexible>
                        <LayerPanel />
                    </SortablePanel>
                );
            default:
                return null;
        }
    };

    return (
        <aside className="w-80 bg-neutral-900 border-l border-neutral-800 h-full overflow-hidden px-2.5 py-3 shrink-0 flex flex-col">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={activePanels}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="flex flex-col gap-3 flex-1 h-full min-h-0">
                        {activePanels.map(renderPanel)}
                    </div>
                </SortableContext>
            </DndContext>
        </aside>
    );
};