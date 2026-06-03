# conductor-review

Review a completed track before closing it.

## When to use
- All tasks in a track are marked complete
- Before merging a feature branch
- User asks for a review of completed work

## Workflow
1. **Gather ALL agents** for collective review:
   - AgentArquitecto: security, architecture, code quality
   - AgentQA: functionality, edge cases, user experience
   - AgentPerformance: performance, memory, resilience
   - AgentResearch: consistency with prior decisions, Engram memory
   - KimiBuildWorker: build status, CI readiness
   - JuniorQwen: potential regressions, fix readiness
2. **Each agent reviews independently** and reports:
   - ✅ Approved — no issues
   - ⚠️ Warning — non-blocking concern
   - 🔴 Issue — must fix before merge
3. **If ANY agent reports 🔴**:
   - Document the issue
   - Create a fix task
   - Delegate to appropriate agent
   - Re-review after fix
4. **If ALL agents approve**:
   - Update track status to "done"
  - Update docs/legacy/ESTADO_TAREAS.md
   - Save summary to Engram with `mem_save`
   - Present final report to user
   - Wait for user feedback before merge

## Rules
- ALL agents must participate in review
- No merging without unanimous approval
- Document every issue found, even if fixed
- User has final say — wait for their feedback
