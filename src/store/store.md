# Store.md

Aquí tienes la documentación oficial de tu nuevo módulo de estado global. Puedes guardar esto en un archivo llamado `README.md` dentro de tu carpeta `src/store/` para futuras referencias.

## 📚 Documentación: Estado Global (Zustand Slices)

Este módulo maneja el estado global de la aplicación **Plynte Engine** utilizando la librería Zustand mediante el **Patrón de Slices (Rebanadas)**. Este patrón divide el estado monolítico en módulos pequeños, temáticos e independientes, facilitando el mantenimiento y la escalabilidad del código.

### 📁 Estructura de Directorios

```text
src/store/
├── slices/
│   ├── layerSlice.ts      # Lógica de capas y comunicación con Rust
│   ├── settingsSlice.ts   # Configuración de herramientas y atajos
│   └── uiSlice.ts         # Estado de la interfaz de usuario
├── types.ts               # Interfaces y contratos de TypeScript
└── useStore.ts            # Raíz que ensambla todas las rebanadas
```

---

### 🧩 Descripción de Módulos

#### 1. `types.ts` (Contratos)

Define la forma exacta de los datos en toda la aplicación.

* **Interfaces Base:** `Layer`, `BrushSettings`, `Keybinds`.
* **Interfaces de Slices:** Define qué estados y acciones exporta cada rebanada (`UISlice`, `SettingsSlice`, `LayerSlice`).
* **`AppState`:** La interfaz maestra que une todas las rebanadas.

#### 2. `slices/uiSlice.ts` (Interfaz)

Maneja variables puramente visuales que no afectan al lienzo ni al backend.

* **Estado:** `isLayerPanelOpen`, `triggerRender`.
* **Acciones:** `toggleLayerPanel`, `forceRender` (fuerza una actualización manual en el canvas de React).

#### 3. `slices/settingsSlice.ts` (Herramientas)

Controla el comportamiento del pincel y el hardware del usuario.

* **Estado:** `settings` (herramienta activa, color, tamaño, opacidad, suavizado), `keybinds`, `modifiers` (teclas Shift/Ctrl presionadas).
* **Acciones:** `setSettings`, `setModifiers`.

#### 4. `slices/layerSlice.ts` (Motor de Capas)

Es el puente de comunicación entre React y el backend en Rust.

* **Estado:** `layers` (arreglo de `OffscreenCanvas`), `activeLayerId`.
* **Acciones de Mutación local y remota:** `addLayer`, `removeLayer`, `toggleLayerVisibility`, `setLayerOpacity`, etc.
* **Nota Arquitectónica:** Todas las acciones de este slice notifican simultáneamente a Tauri (`invoke`) y actualizan la UI en React.

#### 5. `useStore.ts` (El Ensamblador)

El punto de entrada principal para toda la aplicación de React. Importa todas las rebanadas y las inyecta en un único hook global `useAppStore`.

---

### 🛠️ ¿Cómo usarlo en Componentes?

Para mantener el rendimiento y evitar re-renders innecesarios, se recomienda desestructurar solo lo que el componente necesita:

```tsx
import { useAppStore } from '../store/useStore';

export const MiComponente = () => {
    // ✅ FORMA CORRECTA: Extraer acciones o estados específicos
    const { settings, setSettings, addLayer } = useAppStore();

    return (
        <button onClick={() => setSettings({ tool: 'eraser' })}>
            Usar Goma ({settings.size}px)
        </button>
    );
};
```

---
