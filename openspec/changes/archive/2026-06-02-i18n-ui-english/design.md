# Design: English UI Internationalization & README Rewrite

## Technical Approach

Direct string literal replacement in 4 React TSX components and a full README.md rewrite. No i18n framework, no runtime dependencies, no new imports. Each change is a self-contained text edit within a single file — no cross-component wiring. The Rust backend stays in Spanish; only the React UI layer and project documentation change.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| i18n mechanism | Direct string replacement | react-i18next, react-intl, custom locale provider | Zero-runtime-cost. No framework setup, no bundle bloat, no locale-switching overhead. The app has one language for all users (English). An i18n framework adds complexity for a problem that doesn't exist yet. |
| OS dialog strings | Translate inline (title, defaultPath, filters[].name) | Leave them Spanish; extract to constants | These strings surface in the OS-native save/open dialog, visible to the user. They must be English. Converting to constants adds indirection without benefit — each string is used exactly once. |
| Code identifiers | Leave Spanish (Rust commands, TS function/variable names, comments) | Translate now; translate later (deferred) | Dev-facing text is out of scope for this UI-only pass. Translating identifiers would break the Tauri IPC layer (command names are typed) and is a large cross-cutting refactor tracked as `i18n-codebase-english`. |
| Preset name "Post Horizontal" | Keep as-is (already English) | Translate to Spanish-to-English | It's already in English. No change needed. |

## Data Flow

No data flow change. Strings are static JSX literals — no state, no props, no store interaction.

```
React TSX (static text) ──→ Browser DOM ──→ User sees English UI
React TSX (dialog args) ──→ Tauri API      ──→ OS-native dialog (English)
```

The only "flow" is that `ExportButton.tsx` passes translated strings to `saveFileDialog()` / `openFileDialog()` — Tauri's native dialog API receives English title/defaultPath/filters directly.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `README.md` | Rewrite | Full English rewrite: badges, quickstart, architecture (fix `Mutex`→`RwLock`), contributor notice for Spanish codebase |
| `src/components/Toolbar/AIPromptModal.tsx` | Modify | 9 UI strings → English (header, labels, placeholder, hint, buttons, error alert, layer name prefix) |
| `src/components/CanvasSetupModal.tsx` | Modify | 9 UI strings → English (header, subtitle, preset names, labels, buttons). "Post Horizontal" and "Stories / Reels" unchanged. |
| `src/components/Toolbar/ExportButton.tsx` | Modify | 17 UI strings → English (dialog titles, defaultPaths, filter names, alerts, buttons, tooltips) |
| `src/components/Toolbar/ToolSelector.tsx` | Modify | 6 UI strings → English (section header, tool names, deselect button) |

No files are created or deleted. No `package.json` changes.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Type safety | All modified files | `tsc --noEmit` — zero errors required |
| Build integrity | Full project | `pnpm build` — must succeed |
| Visual | Every changed component | Manual review of modal headers, labels, buttons, alerts, tooltips |
| Regression | Rust backend | `cargo test` — should pass (no Rust changes) |

No frontend unit tests exist (Vitest not configured). Snapshot tests would catch string regressions but are out of scope for this change.

## Migration / Rollout

No migration required. Each file change is atomic — `git revert` the commit to roll back.

## Known Gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| Export success alert (`alert(resGuardar.data)`) displays raw Rust output | `guardar_dibujo` returns `"Guardado exitoso en: ..."` — the export success alert will show Spanish text in an otherwise-English UI. | Deferred to `i18n-codebase-english`. |
| Save/load project success alerts are frontend-hardcoded | `ExportButton.tsx:42`/`:61` use frontend `alert()` strings (`"¡Proyecto .brick guardado con éxito!"` → translatable). These ARE handled in this change. | Handled in UI strings pass. |
| Rust error messages propagate through catch blocks | `guardar_dibujo`, `guardar_proyecto_brick`, and `cargar_dibujo` return Spanish errors that surface in `alert("Error saving project: " + error)`. | Partially deferred to `i18n-codebase-english`. Frontend error prefixes are translated now; Rust error content remains Spanish. |
| `aiService.ts` error string `"Error del servidor IA:"` | This backend-service error is not in the UI component layer; it will remain Spanish until `i18n-codebase-english`. | Deferred. The `AIPromptModal.tsx` error alert prefix `"Error generating AI image:"` is separate and handled in this change. |
| `layerSlice.ts` and `App.tsx` contain Spanish user-facing strings out of scope | `src/store/slices/layerSlice.ts` has Spanish error alerts (`"Error al guardar el proyecto: ..."`) and 5 loading-progress messages (`"Abriendo archivo .brick..."`, etc.). `src/App.tsx` has Spanish alert/dialog strings. These are outside the 4 scoped component files. | Deferred to `i18n-codebase-english`. After this change, these areas will still show Spanish text. |

### Preset ID Note

Preset `id` values (e.g., `'vertical-classic'`) remain English while `name` values are translated. The `id` field is the canonical identifier for programmatic matching — any code that matches on `name` string instead of `id` will break. This change affects only `name`; `id` values are unchanged.

## Open Questions

None. All strings are identified, their English equivalents are specified, and the change boundaries are clear.
