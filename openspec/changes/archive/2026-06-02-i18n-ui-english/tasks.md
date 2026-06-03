# Tasks: English UI Internationalization & README Rewrite

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 110–140 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (all 5 files) |
| Delivery strategy | ask-on-risk |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: UI String Translation (4 independent files)

- [x] 1.1 `src/components/Toolbar/AIPromptModal.tsx` — 9 strings: header `SDXL ENGINE`, labels `Prompt (Instruction)` / `Strength (AI Creativity)`, placeholder `Describe what you want to generate...`, hint `0.1 = Almost unchanged...`, buttons `GENERATE` / `PROCESSING...`, error alert `Error generating AI image:\n\n...`, layer prefix `AI:`
- [x] 1.2 `src/components/CanvasSetupModal.tsx` — 9 strings: header `NEW CANVAS`, subtitle `Select dimensions for your new artwork.`, presets `Vertical Post (Classic)` / `Vertical Post (New)`, custom `Custom`, labels `WIDTH (PX)` / `HEIGHT (PX)`, buttons `CREATE CANVAS` / `OPEN PROJECT (.brick)`. Presets `Post Horizontal` and `Stories / Reels` unchanged.
- [x] 1.3 `src/components/Toolbar/ExportButton.tsx` — 17 strings: dialog titles `Export Masterpiece` / `Save Layer Project` / `Open Layer Project`, filenames `My_Plynte_Art.png` / `Canvas_Project.brick`, filter `Brick-Draw Project` (×2), alerts `.brick project saved/loaded successfully!` / `Error exporting/saving/loading project:`, tooltips `Save/Open .brick project with layers`, buttons `Save` / `Open` / `Export PNG`
- [x] 1.4 `src/components/Toolbar/ToolSelector.tsx` — 6 strings: header `Mode`, tools `Brush` / `Eraser` / `Wand` / `Move`, deselect `Deselect`

## Phase 2: README Rewrite

- [x] 2.1 `README.md` — Full English rewrite: project badges (license, stars, build), English prose, quickstart (pnpm + Tauri 2), architecture overview with `Arc<RwLock<AppState>>` (fix `Mutex`→`RwLock`), tiny-skia as pure Rust library (fix `C++/Rust puro`), contributor notice for Spanish codebase referencing `i18n-codebase-english`

## Phase 3: Verification

- [x] 3.1 Run `tsc --noEmit` — must pass with zero errors
- [x] 3.2 Run `pnpm build` — must succeed
- [x] 3.3 Run `cargo test --manifest-path src-tauri/Cargo.toml` — regression check
- [x] 3.4 Grep affected TSX files for remaining Spanish chars (ñ, áéíóú, ¿¡) — zero matches expected
- [x] 3.5 Manual visual review checklist: AIPromptModal header/labels/buttons/error alert, CanvasSetupModal presets/custom/labels, ExportButton dialogs/alerts/tooltips, ToolSelector tool names/header/deselect
