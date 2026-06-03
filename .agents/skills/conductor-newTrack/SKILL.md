# conductor-newTrack

Create a new feature/bugfix/refactor track with full spec before any coding.

## When to use
- New feature request from user
- Bug fix that needs planning
- Refactor with scope ambiguity
- Any change where requirements need clarification

## Workflow
1. **Recover Engram context** for brick-draw — `mem_context` then `mem_search`
2. **Clarify requirements** — if ambiguous, present multiple-choice questions to user
3. **Consult agents** — share the request with all agents, gather their input on:
   - Architecture implications (AgentArquitecto)
   - QA/test strategy (AgentQA)
   - Performance impact (AgentPerformance)
   - Research/precedents (AgentResearch)
4. **Create track** in `conductor/tracks/<track-name>/`:
   - `spec.md` — what, why, acceptance criteria
   - `plan.md` — approach, architecture decisions, risks
   - `tasks.md` — numbered checklist, dependencies
   - `risks.md` — what could go wrong, mitigations
   - `acceptance.md` — how we know it's done
5. **Present to user** for approval before any implementation

## Rules
- NO coding until track is approved by user
- All agents must review and agree on the plan
- Edge cases must be documented in spec.md
- Each task must be independently testable
- Include resilience and idempotency requirements
