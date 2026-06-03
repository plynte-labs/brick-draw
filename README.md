# Brick.Draw (Tauri + React + TypeScript)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/plynte-labs/brick-draw)](https://github.com/plynte-labs/brick-draw/stargazers)
[![Build](https://img.shields.io/badge/build-manual-lightgrey)]()

> **Contributor Notice**: Internal code identifiers (Rust commands, TypeScript function/variable names, code comments) are currently in Spanish. An English codebase translation is tracked as a future change (`i18n-codebase-english`).

**Brick.Draw** is a lightweight creative desktop application. Its focus is minimizing RAM consumption — only what's strictly necessary.

## Public release notes

- License: MIT
- Maintainer: Plynte Labs
- AI generation is **optional** and works through an external server configured by the collaborator
- No API keys are required by the repository itself
- No model weights, ComfyUI workflows, or paid APIs are bundled into the project

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5, Tailwind CSS 4, Zustand 5 |
| Desktop | Tauri 2 |
| Backend | Rust, tiny-skia |
| Build | Vite, pnpm |

## Quickstart

```bash
pnpm install
pnpm tauri dev      # Development with hot reload
pnpm tauri build    # Production build
```

## External communication

Brick.Draw only communicates with these targets:

| Target | Required | Purpose |
|-------|----------|---------|
| Tauri IPC (React <-> Rust) | Yes | Local desktop communication between the UI and the native engine |
| File system dialogs via Tauri plugins | Yes | Open/export `.brick` projects and PNG files |
| `VITE_AI_SERVER_URL` | No | Optional HTTP endpoint for AI image generation from the current canvas |

### AI server contract

- The AI feature is disabled unless `VITE_AI_SERVER_URL` is defined in `.env`
- Brick.Draw sends a `multipart/form-data` `POST` request
- Current fields: `image`, `prompt`, `strength`, `num_inference_steps`, `guidance_scale`, `forzar_cuadrado`
- The endpoint is expected to return an image blob
- The default desktop CSP allows local AI servers on `localhost` / `127.0.0.1`; remote endpoints require an explicit security review

More detail: [`docs/external-communication.md`](docs/external-communication.md)

## Collaboration and trust

- Local environment files are ignored by git (`.env`, `.env.local`, `.env.*.local`)
- Sensitive-data hooks live in [`.githooks/pre-commit`](.githooks/pre-commit) and [`.githooks/scan-sensitive.ps1`](.githooks/scan-sensitive.ps1)
- Activate hooks after clone:

```bash
git config core.hooksPath .githooks
```

## Architecture

### Frontend (The Visual Interface)

- **React + TypeScript**: Provides a robust ecosystem for building a reactive UI (Toolbar, Layer Manager) with strict typing to prevent buffer handling bugs.
- **Tailwind CSS**: Enables rapid UI iteration without leaving `.tsx` files, achieving a professional dark-mode aesthetic with utility classes.
- **Zustand**: Chosen over Redux or Context API for its ability to update specific components without triggering mass re-renders. Enables manual control of visual reactivity (`triggerRender`).
- **OffscreenCanvas**: Instead of using multiple `<canvas>` elements in the DOM (which destroys performance), layers are managed off-screen in the browser's memory and composited onto a single master `<canvas>`.

### Backend (The Native Engine)

- **Tauri 2**: A lightweight Electron alternative. The app weighs only a few megabytes and consumes a fraction of the RAM, creating a secure bridge between JavaScript and the operating system.
- **Rust**: The engine's core. Manages layer memory natively (`Arc<RwLock<AppState>>`). When JS draws, Rust records the mathematical stroke.
- **tiny-skia**: A pure Rust 2D software rendering library that composes the final PNG with pixel-perfect mathematical precision, blending opacities and fusion modes before writing to disk.

### Engine Modules

1. **The Store (`useStore.ts` & `types.ts`)**: The single source of truth. Maintains UI state and communicates with Rust **exclusively** during destructive changes (add/delete/hide layers).
2. **The Render Manager (`useRenderer.ts`)**: Prevents the Fill Rate bottleneck. Instead of redrawing all layers on every pen movement, it snapshots layers above and below. While drawing, only 4 elements render on screen.
3. **The Stroke Dryer (`useStrokeDryer.ts`)**: Listens for `pointerUp` (when you lift the pen), bakes the fresh paint onto the active layer, and sends vector coordinates to Rust to keep the backend synchronized.
4. **The Rust Commands (`commands.rs`)**: Listens for JS requests, allocates native memory buffers, and processes graphic blending math.

### Pros

- **Stroke Performance**: Thanks to the cache system, drawing feels instant and lag-free regardless of document complexity.
- **Controlled Memory**: By using OffscreenCanvas and delegating heavy export to Rust, the main UI thread never freezes during save.
- **Scalability**: Adding new tools (geometric shapes, filters) is straightforward thanks to the separation between the event capturer (`useDrawingEngine`) and the renderer.

### Cons

- **Software Rendering**: Currently both frontend (Canvas 2D) and backend (`tiny-skia`) render on CPU. For massive 4K resolutions or complex textured brushes, this may require a future migration to WebGL / WGPU (GPU acceleration).
- **Maintenance Complexity**: The dual-state architecture (JS + Rust) means any new graphics feature must be implemented twice (once for web display, once for the native backend).
