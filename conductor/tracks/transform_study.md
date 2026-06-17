# Track de estudio: Transform Gizmo — caso aparte

**Estado**: `FUNCIONAL CON BUGS / EN ESTUDIO` (2026-06-17). El gizmo escala/rota/mueve y commitea, pero el commit maneja mal los límites del lienzo. NO bloqueante — se difiere para resolverlo a fondo.

---

## 1. Bug reportado

Al confirmar (Enter) una transformación, **recalcula el "lienzo global"**: si la capa ocupa menos que el canvas, el commit la expande a TODO el canvas y reescala/recoloca el contenido. O sea, la geometría del resultado no respeta el offset/tamaño real de la capa.

**Causa probable** (a verificar): `TransformGizmo.commit()` compone el resultado en un `OffscreenCanvas(canvasSize.width, canvasSize.height)` y lo hornea con `cargarPngEnCapa`, que **reemplaza** el buffer de la capa por ese canvas-size completo y resetea `layer.x/y = 0,0`. Entonces una capa que antes era chica/desplazada pasa a ser del tamaño del lienzo. Además la matriz afín puede estar aplicándose en coords del lienzo y no del bbox real de la fuente.

---

## 2. Direcciones a explorar (cuando se retome)

- **Componer en el bbox de la capa, no en el canvas completo**: el resultado debería conservar el tamaño/offset lógico de la capa (o el bbox de la selección), no expandir a `canvasSize`.
- **Revisar el espacio de la matriz**: la transformación debe operar sobre el bbox de la fuente (capa o selección), con el pivote/handles en ese espacio, no en coords de lienzo.
- **Commit**: en vez de `cargarPngEnCapa` con un PNG canvas-size + reset a (0,0), preservar `layer.x/y` y el tamaño del buffer (o recortar al bbox transformado real).
- Verificar el caso con SELECCIÓN (solo mover/escalar la región seleccionada, dejando el resto de la capa intacto) — hoy probablemente toma toda la capa.

## 3. Lo que SÍ anda (no romper al retomar)

- `affine.ts` (puro, con el fix de pivote compuesto: la esquina opuesta queda fija al escalar, incluso en transformaciones encadenadas) — tiene tests.
- Las manijas/rotación/preview en pantalla siguen la cámara (zoom+offset).
- Esc cancela sin tocar la capa.

Archivos: `src/components/TransformGizmo.tsx`, `src/hooks/engine/transform/affine.ts`.

---

## 4. Decisión

El gizmo queda en la rama (mergeado a master) como base, pero su commit necesita rehacerse para respetar los límites de capa/selección. Este track guarda el contexto para retomarlo como estudio dedicado (igual que la goma).
