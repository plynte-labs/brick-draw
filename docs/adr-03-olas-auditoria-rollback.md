# ADR-03: Remediación por "olas", rollback y restauración selectiva

**Estado**: Aceptado
**Fecha**: 2026-06-17
**Contexto previo**: ADR-01 (concurrencia), ADR-02 (formato .brick), auditoría multi-agente (48 hallazgos) trazada en `conductor/tracks/`.

---

## Contexto

Una sesión autónoma (modo "loop" / ultracode) intentó ejecutar **todo** el roadmap de una vez:
los 8 tracks de auditoría (P0–P3) **más** features profesionales (tableta, gizmo de transformación,
reglas de perspectiva, halftones, resiliencia: watchdog/trazabilidad/navegación). Se construyó en
**~12 ramas stackeadas** con workflows dinámicos (diseño → TDD → review adversarial → fix → verify),
todo dejando los gates en **verde** (`cargo test`, `tsc`, `vite build`, `vitest`).

## Problema

**"Verde" NO equivalió a GUI funcional.** Esta app es Tauri + WebView2 y **no se puede verificar
headless** (el harness de webview crashea: `STATUS_ENTRYPOINT_NOT_FOUND`). Los tests cubrían lógica
pura/Rust en aislamiento, no la integración real en la ventana. Al probar el build:

- `single-pixel-authority` metió un round-trip de IPC por trazo → **lag** notorio sin GPU.
- El `watchdog` de IA **spameaba** el endpoint aunque no se usara la IA.
- `tauri dev` cargaba **en blanco** (CSP bloqueaba el preamble inline de Vite).
- Centrado/zoom, orden de capas en el panel, selección y otras conductas estaban rotas.

Resultado: la app quedó **peor de usar** que el `master` estable, pese a todo verde. Costo alto en
tokens (~USD 200) mayormente en trabajo que hubo que descartar.

## Decisión

1. **Rollback a `master`.** Nada se había mergeado (todo en ramas) → `master` (release público,
   commit `2621411`) quedó intacto como red de seguridad. Cero pérdida de la app estable.
2. **Re-aplicación SELECTIVA y verificada-en-vivo** del subconjunto que valía, sobre `master`,
   **re-implementado/adaptado** (no cherry-pick: las olas vivían en otra base, binary-IPC).
3. **Descarte explícito** del resto (queda archivado en ramas `fix/*`, **NO usar como base**).

## Qué quedó en `master` (commit `52ec484`)

- Seguridad (solo-Rust): guardado **atómico** `.brick`/`.png` (temp+sync_all+rename) + **caps
  anti-bomba** al cargar + **validate-before-mutate** (un `.brick` corrupto ya no borra el proyecto).
- Backend: **lockfree-io** (snapshot-under-lock, no congela al guardar), **honest-concurrency-tests**
  (extracción de `*_core`, elimina un `transmute` con *undefined behavior*, test de latencia bounded),
  **project-hygiene** (saca `wgpu`/`image`/`GpuContext`/`texture`, borra dead code, CI).
- Dibujo: goma **uniforme** + race-guard del dryer async, **estabilización** (EMA + flush), plomería
  de **presión de tableta** (`resolvePressure` por `pointerType`).
- Features: **command-log-undo** (deshace move/opacity/visibility/delete/reorder), **curvas de
  presión** (Lineal/Suave/Dura), **error boundary**, **navegación** (camera puro).

## Descartado (archivado en ramas `fix/*`; no rebasar sobre esto)

`single-pixel-authority` (IPC por trazo = lag), `frontend-state-hygiene`, reglas de perspectiva,
halftones, watchdog de IA (spam), trace logger.

## Diferido a estudio dedicado (tracks)

- `conductor/tracks/eraser_study.md` — goma decente pero arquitectura frágil (2 rasterizadores
  JS+Rust, dryer async).
- `conductor/tracks/transform_study.md` — el commit del gizmo recalcula el lienzo global / reescala
  (no respeta el bbox de capa/selección).

## Consecuencias y lecciones

- **`master` quedó mejor que el release original** — pero el **costo fue muy superior al necesario**.
  El mismo destino se alcanzaba incremental por una fracción del costo.
- **Tests verdes ≠ GUI funcional** en una app no verificable headless. Para esta app: cambios
  **chicos, verificados en vivo** por una persona, no tandas grandes "todo verde".
- **Rollback temprano > insistir.** Volver a estable y re-aplicar lo selecto fue lo que destrabó.
- El patrón **orquestador-gatekeeper** (revisión independiente de diffs) atrapó bugs reales, pero
  solo rinde sobre cambios acotados, no sobre 12 olas simultáneas.
- **No sobre-extender el alcance**: ejecutar "todo el roadmap" autónomamente fue el error de raíz.

## Referencias

- Engram (topic keys): `sdd/audit-remediation/state`, `brick-draw/selected-restore-branch`, y los
  `sdd/<track>/apply-progress` por track.
- Rama estable PURA (sin nada de esto): commit `2621411`. Punto de re-aplicación: `ee98ce5` → merge
  `52ec484`.
