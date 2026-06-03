# conductor-status

Inspect current tracks and progress.

## When to use
- User asks "what's the status?"
- Need to see active tracks
- Checking progress before starting new work

## What it shows
1. List all tracks in `conductor/tracks/`
2. For each track:
   - Status: planned / in-progress / review / done
   - Tasks completed / total
   - Last activity date
3. Active branch for each track (if using feature branches)

## Output format
```
## Active Tracks
| Track | Status | Progress | Branch |
|-------|--------|----------|--------|
| fix/path-traversal | in-progress | 3/5 | feature/fix-path-traversal |
| feat/export-svg | planned | 0/8 | - |
```
