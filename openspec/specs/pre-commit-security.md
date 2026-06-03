# Spec: Pre-commit Security Scan

**Status**: Active
**Version**: 1.0.0
**Date**: 2026-06-01

## Purpose

Automatically block commits containing sensitive data before they enter the repository history. This applies to all contributors and CI/CD pipelines.

## Requirements

### REQ-SEC-001: Forbidden File Detection

The system MUST block commits that stage any of the following files:

- `.env`, `.env.local`, `.env.*.local` — environment variables with potential secrets
- `prompt.md` — local prompt scratch files not intended for publication
- `config.json` inside tooling directories — personal configuration

**Scenario**: Developer accidentally stages `.env.local`
- **Given** a `.env.local` file exists locally
- **When** the developer runs `git add .env.local` and `git commit`
- **Then** the commit SHALL be blocked with a clear error message

### REQ-SEC-002: Secret Pattern Detection

The system MUST detect and block common secret patterns in staged files:

- OpenAI-style keys (`sk-...`)
- GitHub personal access tokens (`ghp_...`)
- HuggingFace tokens (`hf_...`)
- Bearer tokens in source code

**Scenario**: Developer hardcodes an API key
- **Given** a TypeScript file contains `const API_KEY = "sk-abc123..."`
- **When** the developer stages and commits the file
- **Then** the commit SHALL be blocked

### REQ-SEC-003: Absolute Path Detection

The system MUST block files containing absolute filesystem paths:

- Windows: `C:\Users\...`, `D:\workspace\...`
- Unix: `/home/user/...`, `/Users/name/...`

**Scenario**: Developer leaves a local path in documentation
- **Given** a markdown file contains `D:\workspace\project-name\...`
- **When** the developer commits the file
- **Then** the commit SHALL be blocked

### REQ-SEC-004: Hardcoded Localhost Endpoints

The system MUST block hardcoded localhost URLs in source files:

- `http://127.0.0.1:PORT/...`
- `http://localhost:PORT/...`

Exceptions: Tauri dev URLs (`http://localhost:1420`) are allowed as they are standard Tauri configuration.

**Scenario**: Developer hardcodes an AI server endpoint
- **Given** TypeScript file contains `const URL = "http://127.0.0.1:8000/api"`
- **When** committed
- **Then** the commit SHALL be blocked with guidance to use env vars

### REQ-SEC-005: Subscription/Personal Data in Config

The system MUST detect and block `"subscription"` fields in JSON configuration files.

**Scenario**: `agents.json` or `opencode.json` contains a subscription key
- **Given** a JSON config with `"subscription": "opencode-go"`
- **When** staged for commit
- **Then** the commit SHALL be blocked

### REQ-SEC-006: Compiled/Dependency Files

The system MUST block accidental staging of:

- `node_modules/` directories
- `__pycache__/` directories
- `.pyc` compiled files

## Implementation

### Hook Architecture

```
.githooks/
├── pre-commit          # Bash hook — runs on git commit
└── scan-sensitive.ps1  # PowerShell — standalone/CI scanner
```

### Integration Points

| Trigger | Scanner | Scope |
|---------|---------|-------|
| `git commit` | `pre-commit` (bash) | Staged files only |
| `git push` | `pre-push` equivalent | Commits being pushed |
| CI pipeline | `scan-sensitive.ps1` | Full repo |
| SDD verify | `scan-sensitive.ps1 -Since` | Change diff |

### Activation

Contributors activate hooks after clone:

```bash
git config core.hooksPath .githooks
```

Or via `setup.bat` / `setup.sh`.

### Bypass (Emergency Only)

```bash
git commit --no-verify  # Skips pre-commit hook
```

This MUST only be used in emergencies. The CI pipeline still enforces all checks.

## Verification

- [ ] Pre-commit hook blocks forbidden files
- [ ] Pre-commit hook blocks secrets
- [ ] Pre-commit hook blocks absolute paths
- [ ] Pre-commit hook blocks hardcoded localhost
- [ ] Standalone scanner passes on clean repo
- [ ] CI integration (GitHub Actions) enforces same checks
