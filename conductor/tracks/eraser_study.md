# Track de estudio: Goma (Eraser) — caso aparte

**Estado**: `DECENTE / EN ESTUDIO` (2026-06-17). Funcional y aceptable para uso; quedan problemas de arquitectura por estudiar a fondo. NO bloqueante — se difiere a propósito.

---

## 1. Estado actual (lo que YA se arregló en master)

- **Borrado uniforme**: el preview de la goma usa blanco OPACO (alpha 1.0) en vez de 0.4. Antes el alpha se acumulaba desigual en trazos rápidos (denso en caps/curvas, fino en tramos rectos) y el `destination-out` borraba proporcional → "más claro luego oscuro". Ahora es parejo. (commit `ee98ce5`)
- **Toma desde el clic** (no "arranca desde la mitad"): era una **race del dryer asíncrono** — el `pointerup` del trazo anterior corría `await procesarTrazo` y, al resolver, limpiaba el wet y reseteaba `strokePoints` del trazo NUEVO. Guard `if (!isDrawingRef.current)` + snapshot de puntos. (commit `ce958c7`)
- **Flush del punto final** + estabilización a 0.5 por defecto (el EMA dejaba el trazo corto). (commit `4cd4540`)
- **Presión de tableta** por `pointerType` (lápiz real / mouse full). (commit `e033fe4`)

Archivos: `src/hooks/engine/tools/brushTool.ts`, `src/hooks/engine/useStrokeDryer.ts`, `src/hooks/useDrawingEngine.ts`, `src/hooks/engine/pressure.ts`.

---

## 2. Por qué es "caso de estudio" (problemas de fondo, no resueltos)

1. **Dos rasterizadores (JS + Rust)**: la goma estampa en JS (`destination-out` sobre `layer.buffer`) Y Rust re-rasteriza el mismo trazo en `procesar_trazo`. Son dos caminos que *deberían* coincidir pero pueden divergir (AA, redondeo, orden). Lo que se muestra = buffer JS; lo que se guarda = puede diferir. (Esto es ARCH-1 del audit; el intento "single-pixel-authority" de hacer a Rust autoridad única metió un round-trip de IPC por trazo → LAG sin GPU → se descartó.)
2. **Ciclo de vida del trazo frágil**: refs mutables compartidos (`wetLayer`, `strokePoints`, `currentPoint`) + dryer async. Lo parchamos con un guard, pero la raíz es que no hay una máquina de estados/ID de trazo limpia; otra race latente es posible.
3. **Preview vs commit**: el preview muestra el borrado en vivo (wet `destination-out`), el commit estampa + manda a Rust. Modelo de doble pintura.

---

## 3. Direcciones a explorar (cuando se retome)

- **Una sola autoridad de raster** SIN round-trip por trazo: p.ej. estampar en JS al instante (autoridad de display) y reconciliar con Rust de forma diferida/asíncrona (no por trazo), o batch. Evitar el costo del single-pixel-authority.
- **Stroke lifecycle con ID**: cada trazo con un id; el dryer solo toca refs si el id sigue siendo el activo (más robusto que el guard booleano).
- **Goma como destination-out directo sobre el buffer por evento** (sin wet intermedio) para eliminar la divergencia preview/commit — evaluar costo.
- Eventualmente, GPU compositor (descartado por ahora; se sacó wgpu en project-hygiene).

---

## 4. Decisión

Por ahora la goma queda como está (decente). Este track existe para no perder el contexto y retomarla como estudio dedicado, separada del resto del trabajo.
