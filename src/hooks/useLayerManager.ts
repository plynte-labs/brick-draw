// src/hooks/useLayerManager.ts
import { useAppStore } from "../store/useStore";
import { reordenarCapas } from "../services/tauriService";
import {
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export const useLayerManager = () => {
  // 1. Traemos lo necesario del Store global
  const { layers, setLayers, addLayer } = useAppStore();

  // 2. Lógica de Sensores para el Drag & Drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // 3. Lógica compleja de reordenamiento y sincronización con Rust
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layers.findIndex((l) => l.id === active.id);
      const newIndex = layers.findIndex((l) => l.id === over.id);

      // Reordenamos localmente
      const newOrder = arrayMove(layers, oldIndex, newIndex);
      setLayers(newOrder);

      // Sincronizamos con el backend
      reordenarCapas(newOrder.map((l) => l.id)).then((res) => {
        if (!res.success) {
          console.error("Error en Rust:", res.error);
        }
      });
    }
  };

  // 4. Exportamos solo lo que la UI necesita saber
  return {
    layers,
    addLayer,
    sensors,
    handleDragEnd,
  };
};
