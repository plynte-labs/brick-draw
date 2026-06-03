# UI Internationalization Specification

## Purpose

English localization of all user-facing UI strings across brick-draw's React components. This covers labels, buttons, placeholders, alerts, tooltips, and native OS dialog strings. No i18n framework is introduced; this is a direct string replacement pass.

## Requirements

### Requirement: AIPromptModal English Labels

All user-facing text in `src/components/Toolbar/AIPromptModal.tsx` MUST be in English.

#### Scenario: User opens AI generation modal

- GIVEN the user clicks the AI generation button
- WHEN the AIPromptModal renders
- THEN the header SHALL display "SDXL ENGINE" instead of "MOTOR SDXL"
- AND the prompt label SHALL display "Prompt (Instruction)" instead of "Prompt (Instrucción)"
- AND the placeholder SHALL display "Describe what you want to generate..."
- AND the strength label SHALL display "Strength (AI Creativity)" instead of "Fuerza (Creatividad de IA)"
- AND the strength hint SHALL display "0.1 = Almost unchanged | 0.9 = Completely redraws your sketch."

#### Scenario: AI generation is in progress

- GIVEN the user has submitted a prompt and generation is running
- WHEN the button shows the loading state
- THEN it SHALL display "PROCESSING..." instead of "PROCESANDO..."
- AND the generate button SHALL display "GENERATE" instead of "GENERAR"

#### Scenario: AI generation fails

- GIVEN the AI generation request fails with an error
- WHEN the error alert displays
- THEN the message SHALL be "Error generating AI image:\n\n{errorMessage}\n\nCheck the Python server terminal for details." — where {errorMessage} is the dynamic error text from the catch block

#### Scenario: AI-generated layer name prefix

- GIVEN an image is generated via the AI prompt modal
- WHEN the new layer is created and named
- THEN the layer name SHALL use the prefix "AI:" instead of "IA:"

> **Note**: The `aiService.ts:39` error string `"Error del servidor IA:"` is backend-service code, out of scope for this UI-only pass. It is documented in the design Known Gaps and tracked under `i18n-codebase-english`.

### Requirement: CanvasSetupModal English Labels

All user-facing text in `src/components/CanvasSetupModal.tsx` MUST be in English, except strings already in English which SHALL remain unchanged.

#### Scenario: User opens new canvas dialog

- GIVEN the application starts and the canvas setup modal renders
- WHEN the user views the modal
- THEN the header SHALL display "NEW CANVAS" instead of "NUEVO LIENZO"
- AND the subtitle SHALL display "Select dimensions for your new artwork."

#### Scenario: User browses preset sizes

- GIVEN the canvas setup modal is open
- WHEN the user views the preset grid
- THEN "Post Vertical (Clásico)" SHALL become "Vertical Post (Classic)"
- AND "Post Vertical (Nuevo)" SHALL become "Vertical Post (New)"
- AND "Post Horizontal" SHALL remain unchanged
- AND "Stories / Reels" SHALL remain unchanged

#### Scenario: User selects custom dimensions

- GIVEN the user selects the custom size option
- WHEN the custom dimension inputs are visible
- THEN the option label SHALL display "Custom" instead of "Personalizado"
- AND the width label SHALL display "WIDTH (PX)" instead of "ANCHO (PX)"
- AND the height label SHALL display "HEIGHT (PX)" instead of "ALTO (PX)"

#### Scenario: User creates canvas or opens project

- GIVEN the canvas setup modal footer
- WHEN the user views the action buttons
- THEN the create button SHALL display "CREATE CANVAS" instead of "CREAR LIENZO"
- AND the open button SHALL display "OPEN PROJECT (.brick)" instead of "ABRIR PROYECTO (.brick)"
- AND the "brick.draw by" credit line SHALL remain unchanged

### Requirement: ExportButton English Labels

All user-facing text in `src/components/Toolbar/ExportButton.tsx` MUST be in English, including strings passed to Tauri's native OS save/open dialog API.

#### Scenario: User exports as PNG

- GIVEN the user clicks the export PNG button
- WHEN the native OS save dialog opens
- THEN the dialog title SHALL display "Export Masterpiece" instead of "Exportar Obra Maestra"
- AND the default filename SHALL be "My_Plynte_Art.png" instead of "Mi_Arte_Plynte.png"
- AND the filter name SHALL display "PNG Image" instead of "Imagen PNG"

#### Scenario: User saves a .brick project

- GIVEN the user clicks the save project button
- WHEN the native OS save dialog opens
- THEN the dialog title SHALL display "Save Layer Project" instead of "Guardar Proyecto de Capas"
- AND the default filename SHALL be "Canvas_Project.brick" instead of "Lienzo_Proyecto.brick"
- AND the filter name SHALL display "Brick-Draw Project" instead of "Proyecto Brick-Draw"

#### Scenario: User opens a .brick project

- GIVEN the user clicks the open project button
- WHEN the native OS open dialog opens
- THEN the dialog title SHALL display "Open Layer Project" instead of "Abrir Proyecto de Capas"
- AND the filter name SHALL display "Brick-Draw Project" instead of "Proyecto Brick-Draw"

#### Scenario: Save/load operations succeed or fail

- GIVEN a save, load, or export operation completes
- WHEN the alert displays
- THEN success messages SHALL be in English: ".brick project saved successfully!" for save, ".brick project loaded successfully!" for load
- AND export success (`alert(resGuardar.data)`) SHALL remain raw Rust output — not translatable from the frontend (deferred to i18n-codebase-english)
- AND error messages SHALL display full English text: "Error exporting: {errorMessage}", "Error saving project: {errorMessage}", or "Error loading project: {errorMessage}"
- AND the toolbar buttons SHALL display "Save" and "Open" instead of "Guardar" and "Abrir"
- AND the export button SHALL display "Export PNG" instead of "Exportar PNG"

#### Scenario: Tooltip text is in English

- GIVEN the ExportButton toolbar renders
- WHEN the user hovers over the save button
- THEN the tooltip SHALL display "Save .brick project with layers" instead of "Guardar archivo .brick con capas"
- AND hovering over the open button SHALL display "Open .brick project with layers" instead of "Abrir archivo .brick con capas"

### Requirement: ToolSelector English Labels

All user-facing text in `src/components/Toolbar/ToolSelector.tsx` MUST be in English.

#### Scenario: User views tool selector

- GIVEN the toolbar is rendered
- WHEN the user views the tool selector section
- THEN the section header SHALL display "Mode" instead of "Modo"
- AND the tool names SHALL be "Brush", "Eraser", "Wand", "Move" (replacing "Pincel", "Goma", "Varita", "Mover")

#### Scenario: User deselects wand or move tool

- GIVEN the active tool is "Wand" or "Move"
- WHEN the deselect button renders
- THEN it SHALL display "Deselect" instead of "Quitar Selección"

### Requirement: No Locale Framework Introduced

This change SHALL NOT introduce any i18n framework, locale switching mechanism, or translation loader. All changes are direct string literal replacements in TSX files.

#### Scenario: Post-change code audit

- GIVEN the change has been applied
- WHEN a developer inspects `package.json` and source files
- THEN no new i18n dependencies SHALL exist (e.g., react-i18next, react-intl)
- AND no locale files (`.json`, `.po`, `.yaml`) SHALL exist in the source tree
