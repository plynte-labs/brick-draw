# Conductor Track: Decouple Tauri Side-Effects & Type Sync

**Track Key**: `sdd/decouple-tauri-sideeffects`
**Status**: `COMPLETED`
**Date**: 2026-05-26
**Author**: Antigravity (Senior Graphic Architect)

---

## 1. Goal & Context
To decouple all native Tauri IPC side-effects (`invoke` and `listen`) from the React/Zustand frontend to ensure browser-resilience (demo capability) and Clean Architecture. Additionally, implement automated fail-fast type synchronization between Rust and TypeScript using `ts-rs` decorated structs.

---

## 2. Technical Design & Implementation
*   **Infrastructure Adapter (`tauriService.ts`)**: Centralized port/adapter with dynamic, on-demand loading of `@tauri-apps` modules. If running in browser mode, it intercepts calls gracefully without crashing the UI.
*   **TauriResult Pattern**: Wraps all RPC calls in `{ success: true, data: T } | { success: false, error: string }` to prevent exception bubbling.
*   **Fail-fast Sincronización**: Decorated `PuntoTrazo` and `LayerBounds` with `#[derive(TS)]` and customized relative paths. Integrated `sync-types` script in `package.json` that hooks into Vite's dev/build workflow.

---

## 3. Ground Work Accomplished
*   **Backend (`src-tauri`)**: Added `ts-rs` to dependencies and decorated drawing structures.
*   **NPM Hooks**: Chained `cargo test` to automatically run and update interfaces under `src/types/` before TypeScript compilation.
*   **Zustand Store**: Cleaned all raw invites from `layerSlice.ts` to consume unified adapter functions.
*   **Hooks & Components**: Refactored `useRustSync`, `useLayerManager`, `useHotkeys`, `useStrokeDryer`, `wandTool`, `ImportImageButton`, `ExportButton`, `AIPromptModal`, and `aiService`.

---

## 4. Verification & Status
*   **Rust Tests**: 100% green (`cargo test` passes concurrency and export tests).
*   **TypeScript Compiler**: Compiled with success using strict checks (`tsc --noEmit`).
*   **Production Bundler**: Built perfectly in `3.78s` (`pnpm build`).
