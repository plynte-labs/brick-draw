# Bug Bounty - Tareas Críticas Encontradas

A continuación se listan las correcciones que deben ser mitigadas en orden de urgencia.

### [CRÍTICO] Path Traversal (Arbitrary File Write)
**Ubicación**: `src-tauri/src/commands/draw.rs` (Función `guardar_dibujo`).
**Problema**: El parámetro `ruta` no se valida, exponiendo el sistema de archivos del usuario subyacente.
**Acción Requerida**: Limitar la exportación a paths pre-autorizados, validar que no contengan `..` o usar la primitiva `fs::path` y Dialog Plugins exclusivos de tauri para proteger acceso local.

### [CRÍTICO] Out of Memory (OOM) en Memoria RAM Rust
**Ubicación**: `src-tauri/src/commands/draw.rs` y `App State`.
**Problema**: `history_snapshot.push(pixmap.clone())` crea copias masivas completas de una imagen grande en cada punto intermedio. 
**Acción Requerida**: Modificar `HistorySnapshot` para usar el patrón Command (instrucciones dibujadas) o guardar Diffs reducidos en lugar de clones absolutos, limitando el espacio de memoria.

### [IMPORTANTE] Cuello de botella en Mutex
**Ubicación**: `src-tauri/src/state.rs`
**Problema**: Mutex envuelve la aplicación completa. 
**Acción Requerida**: Cambiar de `Mutex` a `RwLock` para paralelizar lecturas, o particionar bloqueos por capa y canvas.

### [IMPORTANTE] Reducción de OffscreenCanvas en Frontend
**Ubicación**: `src/hooks/engine/useRenderer.ts`
**Problema**: Reservas de 4 Buffers de tamaño 100% de contenedor en resolución multiplicada (dpr). Fuga de memoria en GPU de usuario a corto plazo para resoluciones de 2k y 4k.
**Acción Requerida**: Reducir canvas inactivos a 1 Master composition o habilitar el render on-demand en pedazos más pequeños ("Tiling").