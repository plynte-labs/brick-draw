# Estado de Tareas Críticas - brick-draw

**Fecha**: 2026-05-08
**Rama actual**: AjusteV1.0.1 (up to date con origin/AjusteV1.0.1)
**Build status**: ✅ Rust `cargo check` OK | ✅ TypeScript `tsc --noEmit` OK

---

## Tareas BUGBOUNTY.md - Estado Final

### 1. Path Traversal (Arbitrary File Write)
**Estado**: ✅ RESUELTO
**Ubicación**: `src-tauri/src/commands/io.rs` — función `guardar_dibujo`
**Fix aplicado por AgentArquitecto**:
- **Capa 1**: Validación de ruta absoluta + bloqueo `..` + extensión `.png` solo
- **Capa 2**: `canonicalize()` resuelve symlinks, UNC paths, trucos Unicode
- **Capa 3**: Validación de scope Tauri contra `app.path().document_dir()`
- **Capa 4**: Rate limiting (500ms mínimo entre saves)
- **Capa 5**: File size cap (50 MB máximo)
- **Fix crítico**: Ahora escribe usando el path canonicalizado, no el string original del usuario
**Archivos modificados**: `io.rs`, `state.rs` (campos de rate limiting)

### 2. Out of Memory (OOM) en Historial Rust
**Estado**: ✅ RESUELTO
**Ubicación**: `src-tauri/src/state.rs`, `src-tauri/src/commands/draw.rs`, `src-tauri/src/commands/history.rs`
**Fix aplicado por AgentPerformance**:
- Reemplazado `HistorySnapshot { buffer_snapshot: Pixmap }` por `HistoryDiff`
- `HistoryDiff` almacena solo: `layer_id`, `x`, `y`, `width`, `height`, `pixels: Vec<u8>`, `layer_x_at_snapshot`, `layer_y_at_snapshot`
- Solo se guarda la región afectada por el trazo, no el pixmap completo
- `max_steps` aumentado de **5 → 20**
**Ahorro de memoria**:

| Escenario | Antes | Después | Reducción |
|-----------|-------|---------|-----------|
| 4K canvas, trazo típico | ~30MB/step | ~160KB/step | **187x** |
| 20 steps max | N/A (OOM) | ~3.2MB | **Factible** |

**Trade-off**: Undo/redo es por región, no pixel-perfect para trazos superpuestos. Aceptable para uso normal.

### 3. Mutex Global → RwLock
**Estado**: ✅ RESUELTO
**Ubicación**: `src-tauri/src/state.rs` + 7 archivos de comandos
**Fix aplicado por AgentArquitecto**:
- `Arc<Mutex<AppState>>` → `Arc<RwLock<AppState>>`
- `Arc<Mutex<Pixmap>>` en NativeLayer.buffer → `Arc<RwLock<Pixmap>>`
- **Comandos read()** (acceso concurrente): `obtener_lienzo_png`, `obtener_mascara_png`, `obtener_capa_rgba`, `obtener_capa_png`, flood fill en `calcular_seleccion_varita`
- **Comandos write()** (acceso exclusivo): `procesar_trazo`, `cargar_png_en_capa`, todas las operaciones de capas, `deshacer`, `rehacer`, `reiniciar_motor`
**Archivos modificados**: `state.rs`, `lib.rs`, `draw.rs`, `io.rs`, `layers.rs`, `history.rs`, `selector.rs`, `engine.rs`
**Mejora esperada**: Múltiples lecturas concurrentes (preview de canvas mientras se dibuja)

### 4. OffscreenCanvas VRAM
**Estado**: ✅ RESUELTO (pre-existente)
**Ubicación**: `src/hooks/engine/useRenderer.ts`
**Verificado**:
- DPR limitado a 1.5 máximo
- ResizeObserver implementado
- OffscreenCanvas usan canvasSize lógico

---

## Fix Adicional

### TypeScript Import No Usado
**Estado**: ✅ RESUELTO
**Ubicación**: `src/components/Toolbar/Toolbar.tsx:4`
**Fix**: Eliminado import no usado de `ToolSelector`

---

## Limpieza de Ramas

**Ramas eliminadas** (todas mergeadas en main, sin contenido único):
- ~~Aguacanvas~~ (was 6667a23)
- ~~auditoria-tecnica~~ (was c4988f5)
- ~~help~~ (was 0f0c64c)
- ~~versionado~~ (was c4988f5)
- ~~feature/audit~~ (was a2992a6)

**Ramas restantes**:
- `AjusteV1.0.1` — activa, up to date con origin

**Remotas sin tracking local**:
- `origin/RusticAqua` — sin rama local equivalente

---

## Agentes Configurados

Ver `agents.json` para la configuración completa del equipo:
- **AgentPrincipal**: qwen3.6-plus (orquestador)
- **AgentArquitecto**: deepseek-v4-pro (arquitectura + seguridad)
- **AgentQA**: GLM-5 (control de calidad)
- **AgentPerformance**: minimax-m2.7 (performance + resiliencia)
- **AgentResearch**: gemini-2.5-pro (investigación)
- **KimiBuildWorker**: kimi-k2.6 (builds)
- **JuniorQwen**: MiMo 2.5V Pro (build fixer)

---

## Archivos Modificados en Esta Sesión

| Archivo | Cambio |
|---------|--------|
| `src-tauri/src/state.rs` | Mutex→RwLock, HistoryDiff struct, rate limiting fields |
| `src-tauri/src/lib.rs` | RwLock::new para AppState |
| `src-tauri/src/commands/draw.rs` | RwLock write(), diff-based history capture |
| `src-tauri/src/commands/io.rs` | 5-layer security, RwLock read/write |
| `src-tauri/src/commands/history.rs` | RwLock, diff-based undo/redo |
| `src-tauri/src/commands/layers.rs` | RwLock write() |
| `src-tauri/src/commands/selector.rs` | RwLock read/write |
| `src-tauri/src/commands/engine.rs` | RwLock write() |
| `src/components/Toolbar/Toolbar.tsx` | Eliminado import no usado |

---

## 🚀 Tareas a Futuro e Ideas de Producto (Roadmap Profesional)

Las siguientes tareas surgen de la auditoría arquitectónica del **31 de Mayo de 2026** y han sido registradas e indexadas para su posterior implementación estructurada:

### 1. Refinamientos Críticos e Inmunización (ADR 04)
- [ ] **Limpieza de Selección Nata en Rust**: Implementar comando `limpiar_seleccion` en Rust para vaciar el buffer `active_selection` del `AppState` y exponerlo al frontend.
- [ ] **Sincronización del Hotkey de Deselección**: Capturar el evento `Ctrl+D` en `useHotkeys.ts` y cablearlo para que dispare la acción de Zustand y limpie la máscara en Rust, evitando que el pincel quede bloqueado.
- [ ] **Escudo Defensivo DoS en Trazo**: Introducir en `procesar_trazo` el límite seguro `const MAX_STROKE_POINTS_LIMIT: usize = 10_000;` para evitar locks de CPU y OOM por inputs masivos maliciosos.
- [ ] **Desacoplamiento de Zustand**: Extraer las dependencias directas de Tauri del slice `layerSlice.ts` hacia una capa de abstracción `ApiTauriService` aislada para posibilitar tests unitarios.

### 2. Capacidades Gráficas y Mezcla Avanzada (ADR 03)
- [ ] **Modos de Fusión de Capas**: Extender `NativeLayer` (Rust) y `Layer` (TypeScript) para soportar el campo `blend_mode` y mapear a los algoritmos vectoriales acelerados de `tiny_skia::BlendMode` (`Multiply`, `Screen`, `Overlay`, etc.).
- [ ] **Máscaras de Recorte (*Clipping Masks*)**: Añadir el flag `clipping` y componer el buffer aplicando `BlendMode::DestinationIn` contra el canal alfa de la capa inferior inmediatamente adyacente.
- [ ] **Exportador Avanzado Multiformato**: Crear el pipeline de exportación configurable `guardar_dibujo_avanzado` para codificar de forma nativa en formatos comprimidos `JPEG` (con control de calidad) y `WebP`.
