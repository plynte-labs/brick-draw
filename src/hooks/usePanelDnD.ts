// src/hooks/usePanelDnD.ts
import {
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { useAppStore } from "../store/useStore";

export const usePanelDnD = () => {
  const panelOrder = useAppStore((state) => state.panelOrder);
  const setPanelOrder = useAppStore((state) => state.setPanelOrder);

  // 1. Configuramos los sensores
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // 2. Manejamos el soltado
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = panelOrder.indexOf(active.id as string);
      const newIndex = panelOrder.indexOf(over.id as string);
      setPanelOrder(arrayMove(panelOrder, oldIndex, newIndex));
    }
  };

  return { sensors, handleDragEnd, panelOrder };
};
