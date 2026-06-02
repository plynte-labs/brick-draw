# Brick.Draw (Tauri + React + Typescript)

**Brick.Draw** es un software creativo de uso lígero.
Su enfoque es principalmente no consumir tanta RAM a menos que sea extrictamente necesario.

## Tecnologías utilizadas

React biblioteca de Javascript que permite la facilidad de construcción de interfaces interactivas, uso de hooks, reutilización de componentes (funciones), así como mejora del rendimiento al manipular el virtual DOM.

Typescript superset de Javascript que corrige el tipado dinámico a tipado fuerte, permitiendo evitar errores comunes sucedidos en tiempo de ejecución debido al tipado dinámico de Javascript

Tauri es un framework alternativa a Electron que permite renderizar aplicaciones de escritorio ligeras y rapidas permitiendo el uso de Rust (como backend).

Vite es un build tool que permite un desarrollo rápido en React.

Rust es un lenguaje que su caracteristica principal es ser seguro y optimizar el manejo de memoria RAM.

### Características Principales

**Motor de renderizado**
**Interfaz de usuario independiente** La U.X se renderiza gracias a React.
**Sincronicación dual de estado** Gracias al uso de Zustand.
**Herramientas modulares**.
**Exportación nativa** Uso de la API del sistema operativo (vía Tauri) para guardar composiciones PNG directamente en el disco duro, componiendo la imagen final utilizando `tiny-skia` en C++/Rust puro.

### 🖥️ Frontend (La Interfaz Visual)

* **React + TypeScript:** Proporciona un ecosistema robusto para construir una UI reactiva (Toolbar, Gestor de Capas) asegurando tipado estricto para evitar bugs en el manejo de buffers en memoria.
* **Tailwind CSS:** Permite iterar la interfaz rápidamente sin salir del archivo `.tsx`, logrando una estética "Dark Mode" profesional con clases de utilidad.
* **Zustand:** Se eligió sobre Redux o Context API por su capacidad de actualizar componentes específicos sin provocar re-renderizados masivos. Además, permite un control manual de la reactividad visual (`triggerRender`).
* **OffscreenCanvas:** En lugar de usar múltiples `<canvas>` en el DOM (lo cual destruye el rendimiento), las capas se gestionan "fuera de la pantalla" en la memoria del navegador y se componen en un único `<canvas>` maestro.

### ⚙️ Backend (El Motor Nativo)

* **Tauri:** La alternativa ligera a Electron. Permite que la app pese apenas unos megabytes y consuma una fracción de la RAM, creando un puente de comunicación seguro entre JavaScript y el Sistema Operativo.
* **Rust:** El corazón del motor. Gestiona la memoria de las capas de forma nativa (`Arc<Mutex<AppState>>`). Cuando JS dibuja, Rust registra el trazo matemático.
* **Tiny-Skia:** Una librería de renderizado 2D en software (escrita en Rust) que compone el PNG final con precisión matemática perfecta, mezclando opacidades y modos de fusión antes de escribir al disco duro.

---

#### 🏗️ Arquitectura del Motor

El proyecto está modularizado:

1. **El Store (`useStore.ts` & `types.ts`):** La única fuente de la verdad. Mantiene el estado de la UI y se comunica con Rust **exclusivamente** cuando ocurren cambios destructivos (añadir/borrar/ocultar capas).
2. **El Gestor de Renderizado (`useRenderer.ts`):** Previene el cuello de botella del *Fill Rate*. En lugar de dibujar todas las capas a cada milímetro de movimiento del lápiz, crea una "foto" de las capas inferiores y superiores. Al trazar, solo dibuja 4 elementos en pantalla.
3. **El Secador de Trazos (`useStrokeDryer.ts`):** Escucha el evento `pointerUp` (cuando levantas el lápiz), plasma la pintura fresca en la capa activa y envía las coordenadas vectoriales a Rust para mantener el backend sincronizado.
4. **El Comando Rust (`commands.rs`):** Escucha las peticiones de JS, reserva buffers nativos de memoria y procesa las matemáticas de mezcla gráfica.

---

##### Ventajas (Pros)

* **Rendimiento en trazo:** Gracias al sistema de caché, dibujar se siente instantáneo y libre de lag, independientemente de la complejidad del documento.
* **Memoria controlada:** Al usar OffscreenCanvas y delegar la exportación pesada a Rust, el hilo principal de la interfaz nunca se congela durante el guardado.
* **Escalabilidad:** Añadir nuevas herramientas (como figuras geométricas o filtros) es sencillo gracias a la separación entre el capturador de eventos (`useDrawingEngine`) y el renderizador.

##### Desventajas

* **Renderizado por Software:** Actualmente, tanto el frontend (Canvas 2D) como el backend (`tiny-skia`) renderizan en CPU. Para resoluciones 4K masivas o pinceles texturizados complejos, esto podría requerir una futura migración a WebGL / WGPU (Aceleración por Tarjeta Gráfica).
* **Complejidad de Mantenimiento:** La arquitectura de Doble Estado (JS + Rust) requiere que cualquier nueva característica gráfica deba programarse dos veces (una para la visualización web y otra para el backend nativo).

---
