# Proposal: English UI Internationalization & README Rewrite

## Intent

Brick-draw is being open-sourced under the Plynte organization (MIT license). The
public interface — UI strings and documentation — is entirely in Spanish. This
blocks discoverability and adoption by the international community. We must
translate all user-facing text to English while keeping the Rust backend Spanish.

## Scope

### In Scope
- Rewrite **README.md**: English prose, badges (license, stars, build), quickstart, architecture overview, contributing link. Fix outdated `Mutex` → `RwLock`.
- Translate **~41 user-facing UI strings** across 4 components:
  - `AIPromptModal.tsx` (9 strings): labels, placeholder, help text, buttons, error alert
  - `CanvasSetupModal.tsx` (9 strings): preset names, header, subtitle, labels, buttons
  - `ExportButton.tsx` (17 strings): dialog titles, filenames, filter names, alerts, buttons, tooltips
  - `ToolSelector.tsx` (6 strings): tool names, section header, deselect button
- Existing English text (e.g., `Stories / Reels` preset, `brick.draw by` credit) stays as-is.

### Out of Scope
- Rust backend commands (stay in Spanish)
- Code comments, variable names, JSX comments (developer-facing)
- `ESTADO_TAREAS.md`, `BUGBOUNTY.md`, `conductor/tracks/` (internal docs)

### Deferred (low priority)
- **`i18n-codebase-english`** — Translate Rust command names, TypeScript function/variable names, and all code comments from Spanish to English. This is a large cross-cutting refactor affecting the Tauri IPC layer and every component. Tracked as a future change, not part of this UI-only pass. The README will note this for contributors.

## Capabilities

### New Capabilities
- `readme`: English project documentation with setup, badges, and architecture overview
- `ui-i18n`: English-localized UI labels, buttons, alerts, and tooltips

### Modified Capabilities
- None (no existing specs to modify; this is the project's first change)

## Approach

Direct string replacement — no i18n framework, no locale switching. We replace
every Spanish user-facing literal in TSX files with its English equivalent.

**File save dialogs**: `title`, `defaultPath`, `filters[].name` strings passed to
Tauri's native save/open dialog API must also be translated since they appear in
the OS-native dialog window.

**Verification**: `tsc --noEmit` (type safety), `pnpm build` (build integrity),
plus visual inspection of changed components. No frontend tests (Vitest not
configured). If Vitest existed, snapshot tests would lock UI labels to English.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `README.md` | Rewrite | English, badges, quickstart, architecture |
| `src/components/Toolbar/AIPromptModal.tsx` | Modified | 9 UI strings EN |
| `src/components/CanvasSetupModal.tsx` | Modified | 9 UI strings EN |
| `src/components/Toolbar/ExportButton.tsx` | Modified | 17 UI strings EN |
| `src/components/Toolbar/ToolSelector.tsx` | Modified | 6 UI strings EN |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Typos in translated strings | Low | Visual review of each changed component |
| Build break from string edit mistakes | Low | `tsc --noEmit` + `pnpm build` before commit |
| Missing Spanish strings (incomplete translation) | Low | Grep for Spanish chars (ñ, accents) in affected files post-edit |
| Rust backend alerts contain Spanish in English UI | Medium | Save/load/export success/error alerts come from Rust backend (`guardar_dibujo`, `guardar_proyecto_brick`) and will display Spanish text in `alert()` dialogs. Mitigation: frontend should eventually wrap backend strings or use generic English messages. Tracked as `i18n-codebase-english`. |

## Rollback Plan

Each file change is atomic and reversible: `git revert` the commit.

## Dependencies

None. Pure text replacement, no runtime or build-time dependencies.

## Success Criteria

- [ ] All ~41 UI strings in affected components are English
- [ ] README.md includes quickstart, badges, and correct architecture info
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `pnpm build` succeeds
- [ ] Manual visual review confirms no broken UI labels
