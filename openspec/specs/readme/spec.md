# README Specification

## Purpose

English-language project documentation for brick-draw, replacing the current Spanish README. This is the public-facing entry point for the open-source repository.

## Requirements

### Requirement: English README Content

The README.md file MUST be written entirely in English prose. All sections previously in Spanish SHALL be translated.

#### Scenario: Reader lands on repository

- GIVEN a developer visits the brick-draw GitHub repository
- WHEN they view the README.md
- THEN all section headers and body text SHALL render in English
- AND the README SHALL include project badges for license, stars, and build status

#### Scenario: Developer follows quickstart

- GIVEN a developer wants to run the project locally
- WHEN they follow the quickstart instructions in README.md
- THEN the commands SHALL be compatible with the current tech stack (pnpm, Tauri 2)
- AND the setup steps SHALL complete without errors

### Requirement: Accurate Architecture Description

The README.md MUST accurately describe the current architecture. Any outdated references to `Mutex` SHALL be corrected to `RwLock`.

#### Scenario: Developer reads architecture overview

- GIVEN the architecture section of README.md
- WHEN a developer reads about shared state management
- THEN the description SHALL mention `Arc<RwLock<AppState>>`, NOT `Mutex`
- AND the architecture SHALL be described at a high level suitable for new contributors

#### Scenario: tiny-skia is correctly identified

- GIVEN the architecture section of README.md
- WHEN a developer reads about the Rust rendering backend
- THEN tiny-skia SHALL be described as a pure Rust 2D rendering library, NOT "C++/Rust puro"

### Requirement: Contributor Notice for Spanish Codebase

The README.md MUST include a clear notice informing contributors that internal code identifiers (Rust commands, TypeScript function/variable names, code comments) remain in Spanish, and that an English codebase translation is tracked as a future change (`i18n-codebase-english`).

#### Scenario: Contributor encounters Spanish code identifiers

- GIVEN a contributor reading the README.md
- WHEN they reach the contribution or architecture section
- THEN they SHALL see a notice that backend commands and code identifiers are in Spanish
- AND the notice SHALL reference the tracked future change `i18n-codebase-english`

### Requirement: Existing Internal Documentation Preserved

Non-README documentation files listed as out-of-scope (`docs/legacy/ESTADO_TAREAS.md`, `docs/legacy/BUGBOUNTY.md`, `conductor/tracks/`) MUST NOT be modified as part of this change.

#### Scenario: Post-change file integrity

- GIVEN the `i18n-ui-english` change has been applied
- WHEN a developer reads `docs/legacy/ESTADO_TAREAS.md`, `docs/legacy/BUGBOUNTY.md`, or files in `conductor/tracks/`
- THEN those files SHALL remain in their original language and format
