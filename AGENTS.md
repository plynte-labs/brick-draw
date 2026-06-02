# brick-draw — Contributor Guide

## Project

A desktop drawing application built with **Tauri 2** — Rust backend + React frontend.

| Layer | Stack |
|-------|-------|
| Backend | Rust, tiny-skia, wgpu |
| Frontend | React 19, Vite 7, TypeScript 5.8, Tailwind CSS 4, Zustand 5 |
| Desktop | Tauri 2 |
| Package manager | pnpm |

## Architecture

- `Arc<RwLock<AppState>>` shared state in Rust, managed via Tauri commands
- Commands organized by domain: `draw`, `io`, `history`, `layers`, `selector`, `engine`
- Frontend uses Clean Architecture: `tauriService.ts` as infrastructure adapter
- Type sync: `ts-rs` auto-generates TypeScript types from Rust structs into `src/types/`

## Getting Started

```bash
pnpm install
pnpm tauri dev      # Development with hot reload
pnpm tauri build    # Production build
```

## Testing

```bash
# Backend
cargo test --manifest-path src-tauri/Cargo.toml

# Type check
pnpm tsc --noEmit
```

Frontend tests (Vitest) coming soon.

## Contributing

1. Create a feature branch: `feature/<description>`
2. Keep changes focused — one concern per PR
3. Write tests for new features and bug fixes
4. Rust: follow existing domain-command patterns
5. TypeScript: use the `tauriService` adapter, never call `invoke` directly

### Before submitting
- `cargo test` passes
- `tsc --noEmit` passes
- `pnpm build` succeeds

## Docs

- `conductor/tracks/` — feature specifications and design documents
- `openspec/` — SDD artifacts (specs, changes, archive)

## License

MIT
