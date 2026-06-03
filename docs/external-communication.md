# Brick.Draw external communication

This document explains exactly what Brick.Draw talks to in the public MIT release.

## Summary

By default, Brick.Draw is a local desktop app.

It does **not** require:

- bundled SDXL models
- ComfyUI
- cloud APIs
- API keys stored in the repository

The only optional external dependency is an AI image server chosen by the contributor.

## Communication map

| Source | Destination | Required | Transport | Why |
|-------|-------------|----------|-----------|-----|
| React frontend | Rust backend | Yes | Tauri IPC | Drawing, layers, history, export, file operations |
| Rust backend | Local file system | Yes | Native OS access through Tauri commands/plugins | Save/open `.brick` projects and PNG exports |
| React frontend | `VITE_AI_SERVER_URL` | No | HTTP `POST` with `multipart/form-data` | Optional AI image generation from the current canvas |

## Default security boundary

The public desktop configuration keeps a CSP in place and allows AI requests to:

- `http://localhost:*`
- `http://127.0.0.1:*`

If a collaborator wants to call a remote AI endpoint, they should update the Tauri CSP deliberately instead of shipping with CSP disabled.

## AI endpoint behavior

When `VITE_AI_SERVER_URL` is configured, Brick.Draw:

1. asks Rust for the current canvas as PNG bytes
2. builds a `multipart/form-data` request
3. sends the request to the configured endpoint
4. expects an image response
5. inserts the returned image into a new layer

Current request fields:

- `image`
- `prompt`
- `strength`
- `num_inference_steps`
- `guidance_scale`
- `forzar_cuadrado`

## What this release does not guarantee

- a specific model such as SDXL
- a bundled inference server
- ComfyUI compatibility
- hosted inference
- free or paid third-party API availability

That is deliberate: the public repository stays lightweight, auditable, and affordable for collaborators.

## Recommended wording for contributors

Use this mental model:

> Brick.Draw provides the canvas and the optional integration point. Contributors choose whether to connect their own AI server.
