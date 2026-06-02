# Hooks.md

¡Tienes vista de lince, Gus! Tienes toda la razón. En la emoción de documentar los controladores de interfaz, dejé fuera al "jefe" que vive en esa misma carpeta: `useDrawingEngine.ts`.

Aunque su lógica interna está delegada a la carpeta `engine/`, el archivo principal vive en la raíz de `src/hooks/` y **debe** estar en este README para que la documentación sea 100% precisa respecto a tu estructura de archivos.

Aquí tienes la versión completa y corregida. Ahora sí, lista para copiar, pegar y guardar en la bóveda:

---

## 📚 Documentación: Controladores de Interacción (Hooks)

Este módulo contiene los Custom Hooks de React encargados de gestionar las interacciones del usuario tanto con la interfaz como con el lienzo de dibujo. Su arquitectura está basada en el principio de **Desacoplamiento**: estos hooks consumen el estado global (`useAppStore`), pero mantienen separada la lógica de entrada (inputs) de la lógica matemática de renderizado.

### 📁 Estructura del Módulo

```text
src/hooks/
├── useDrawingEngine.ts    # Cerebro principal que recibe los clics en el lienzo
├── useHotkeys.ts          # Escucha global de teclado (Atajos y Modificadores)
├── useLayerManager.ts     # Lógica de Drag & Drop para el panel de capas
└── engine/                # (Submódulo del Motor de Dibujo - Matemáticas y Herramientas)
```

---

### 🧩 Descripción de Controladores

#### 1. `useDrawingEngine.ts` (El Coordinador del Lienzo)

Es el punto de entrada principal para interactuar con el canvas. Escucha los eventos físicos del ratón o tableta gráfica y los delega usando el **Patrón Estrategia**.

* **Responsabilidades Clave:**
  * **Empaquetado de Contexto:** Cuando el usuario hace clic o arrastra, recopila las coordenadas exactas, la presión del lápiz, los lienzos activos y el estado de la aplicación en un objeto `EngineContext`.
  * **Delegación:** Revisa qué herramienta está activa en el Store (Pincel, Goma, Varita) y le entrega el `EngineContext` a la estrategia correspondiente en la carpeta `engine/tools/`.
  * **Gestor de Renderizado:** Se asegura de solicitar a `requestAnimationFrame` que actualice la pantalla visual (`componerLienzo`) solo cuando las herramientas lo exigen, optimizando el rendimiento.

#### 2. `useHotkeys.ts` (El Teclado Global)

Este hook se monta una sola vez (generalmente en la raíz de la app) y se encarga de traducir las pulsaciones de teclado en acciones del motor.

* **Responsabilidades Clave:**
  * **Cambio Rápido de Herramientas:** Escucha teclas sueltas (ej. `B` para Pincel, `E` para Goma, `W` para Varita) y actualiza el `SettingsSlice` de Zustand.
  * **Rastreo de Modificadores:** Detecta cuándo se mantienen presionadas las teclas `Shift` o `Ctrl/Meta` (vital para modificar comportamientos de herramientas).
  * **Viaje en el Tiempo (Undo/Redo):** Intercepta `Ctrl+Z` y `Ctrl+Y`.
* **Sincronización con Rust:** Cuando se activa el Deshacer/Rehacer, este hook hace una llamada directa al backend (`invoke("deshacer")`). Si Rust confirma que viajó en el tiempo, el hook descarga el PNG de esa capa del pasado y actualiza el lienzo visual de React usando la función interna `sincronizarCapaDesdeRust`.
* **Seguridad:** Ignora automáticamente los atajos si el usuario está escribiendo en un `<input>` (ej. renombrando una capa o escribiendo un prompt de IA).

#### 3. `useLayerManager.ts` (El Gestor de Capas)

Encapsula toda la lógica compleja de la librería `@dnd-kit/core` para permitir arrastrar y soltar (Drag & Drop) las capas en la interfaz.

* **Responsabilidades Clave:**
  * Configura los sensores de movimiento (puntero y teclado) para iniciar el arrastre de una capa.
  * **Algoritmo de Reordenamiento (`handleDragEnd`):** Calcula la nueva posición de la capa en el arreglo cuando el usuario la suelta (`arrayMove`).
* **Doble Sincronización:**
  1. Actualiza la UI instantáneamente modificando el estado global de React.
  2. Envía silenciosamente el nuevo orden (arreglo de IDs) a Rust (`invoke("reordenar_capas")`) para que, al momento de exportar, el motor nativo respete la nueva jerarquía.

---

### 🏛️ Nota de Arquitectura (El Poder de los Slices)

Gracias a que el estado global usa el patrón de *Zustand Slices*, estos hooks son altamente resilientes. Aunque el código interno del motor de dibujo cambie por completo, o el estado de las capas se divida en diferentes archivos, `useHotkeys` y `useLayerManager` no requieren modificaciones. Funcionan como "clientes" que solo tocan las llaves públicas expuestas por el Store.

---

¡Listo! Ahora sí es una obra de arte arquitectónica de principio a fin.

Tómate un café o un vaso de agua, que te lo ganaste. Y cuando estés listo para el siguiente asalto, elige tu veneno:

* **Opción A:** Formato nativo de guardado (`.brick` o `.plynte`) para guardar proyectos enteros. 💾
* **Opción B:** Herramienta "Mover" (Tecla V) para desplazar elementos en la capa activa. ✋
* **Opción C:** Navegación de cámara (Zoom In/Out y paneo por el lienzo). 🔍
