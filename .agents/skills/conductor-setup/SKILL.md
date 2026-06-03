# conductor-setup

Initialize the Conductor SDD project structure for brick-draw.

## When to use
- First time setting up SDD in this project
- Conductor directory structure is missing
- Need to reset track templates

## What it does
Creates `conductor/tracks/` directory with track template structure:
```
conductor/tracks/<track-name>/
  spec.md
  plan.md
  tasks.md
  risks.md
  acceptance.md
```

## Workflow
1. Verify `conductor/tracks/` exists
2. Create track directory with all required files
3. Each file gets a template header
4. Track is now ready for `conductor-newTrack` to fill in

## Rules
- Never overwrite existing tracks without explicit user request
- Track names use kebab-case
- Always create all 5 files (spec, plan, tasks, risks, acceptance)
