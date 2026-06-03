# conductor-revert

Revert a track ONLY when explicitly requested by the user.

## When to use
- User explicitly says "revert this"
- A track caused a critical regression
- User wants to undo a feature

## Workflow
1. Confirm with user: "Are you sure you want to revert <track-name>?"
2. Identify all commits associated with the track
3. Identify the feature branch (if any)
4. Revert commits or delete branch
5. Update track status to "reverted"
6. Document the revert reason in Engram

## Rules
- NEVER revert without explicit user request
- Document why the revert happened
- Preserve the track files for reference
