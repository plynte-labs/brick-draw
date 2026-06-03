# conductor-implement

Implement an approved track one task at a time.

## When to use
- Track spec is approved by user
- Ready to start coding
- Tasks are clear and ordered

## Workflow
1. Read the approved track from `conductor/tracks/<track-name>/`
2. **Delegate tasks to agents** based on their role:
   - Security/architecture changes → AgentArquitecto
   - Performance optimizations → AgentPerformance
   - UI/feature implementation → AgentPrincipal (orchestrates)
   - Build/compile issues → KimiBuildWorker + JuniorQwen
3. **One task at a time** — complete, test, document before next
4. **Tests required**:
   - Unit tests for new logic
   - Resilience tests (error recovery, edge cases)
   - Idempotency tests (running twice produces same result)
5. **After each task**:
   - Run `cargo check` and `tsc --noEmit`
   - Run tests if applicable
   - Document what was done in track's tasks.md (check off)
6. **When all tasks done**: trigger `conductor-review`

## Rules
- Never skip a task
- Never implement outside the spec without asking
- If a task reveals a blocker, stop and inform the user
- All changes must compile clean before moving to next task
- Document decisions and discoveries in Engram
