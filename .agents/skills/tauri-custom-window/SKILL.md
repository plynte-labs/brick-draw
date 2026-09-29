---
name: tauri-custom-window
description: "Trigger: tauri window controls, custom titlebar, frameless window, tauri minimize maximize. Implement frameless custom window controls in Tauri 2 apps."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Use this skill when:
- Creating or refactoring a custom titlebar in a Tauri 2 application.
- Disabling native OS window decorations (`decorations: false`) and adding frameless window controls (minimize, maximize/restore, close).
- Fixing window drag regions or window action permissions in Tauri 2 capabilities.

Do not use this skill for standard OS-decorated windows or non-Tauri web projects.

## Hard Rules

- Always set `"decorations": false` and `"shadow": true` in `src-tauri/tauri.conf.json`. Never omit `"shadow": true` on frameless windows.
- Always declare required core window permissions in `src-tauri/capabilities/*.json`:
  - `core:default`
  - `core:window:allow-close`
  - `core:window:allow-is-maximized`
  - `core:window:allow-minimize`
  - `core:window:allow-start-dragging`
  - `core:window:allow-toggle-maximize`
- Mark drag areas with the HTML attribute `data-tauri-drag-region`.
- Never put `data-tauri-drag-region` on interactive elements (`button`, `input`, `select`) or their direct clickable containers.
- Always wrap Tauri window calls in a try/catch safety boundary so browser previews (`pnpm dev` in browser) do not crash.
- Always subscribe to `appWindow.onResized()` to synchronize maximized state on OS snap and keyboard shortcuts.
- Use standard Windows 11 close hover color (`#c42b1c`) with white text.

## Decision Gates

| Requirement | Action |
|-------------|--------|
| New custom titlebar | Copy `assets/useWindowControls.ts`, `assets/WindowControls.tsx`, and `assets/window-controls.css` |
| Window drag not working | Verify `data-tauri-drag-region` on header and `core:window:allow-start-dragging` in capabilities |
| Window buttons not responding | Check `src-tauri/capabilities/*.json` permissions list |
| Maximized icon out of sync | Ensure `appWindow.onResized()` listener is registered and cleaned up |

## Execution Steps

1. Update `src-tauri/tauri.conf.json`:
   - Set `"decorations": false` and `"shadow": true` under `app.windows[0]`.
2. Update `src-tauri/capabilities/default.json`:
   - Add `core:window:allow-close`, `core:window:allow-is-maximized`, `core:window:allow-minimize`, `core:window:allow-start-dragging`, and `core:window:allow-toggle-maximize`.
3. Integrate the React hook from `assets/useWindowControls.ts`.
4. Integrate the UI controls component from `assets/WindowControls.tsx`.
5. Mount the titlebar in the root layout with `data-tauri-drag-region` on empty areas and `WindowControls` aligned to the top-right corner.
6. Import and apply `assets/window-controls.css`.

## Output Contract

Return:
- Modified configuration files (`tauri.conf.json`, capabilities JSON).
- Created or updated React components and hooks.
- Verification status confirming minimize, toggle maximize, restore icon flip, and close operate without errors.

## References

- `assets/useWindowControls.ts` — React hook with safe Tauri window API wrapper and resize synchronization.
- `assets/WindowControls.tsx` — Pre-built component with Windows 11 style minimize, maximize, and close buttons.
- `assets/window-controls.css` — Standard titlebar and control button styling.
