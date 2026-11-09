---
name: feedback-agentic-workflow
description: "iltan wants each iteration run in agentic phases (design, plan, subagent build, verify, independent review) via superpowers"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8b84aa60-4d77-470f-a96f-f520f7629323
  modified: 2026-11-08T20:17:19.008Z
---

From 2026-11-08 on, run each iteration in phases with agents instead of doing everything inline: brainstorming
(spec, iltan approves) → writing-plans → subagent-driven-development + TDD → verification-before-completion →
requesting-code-review (+ /security-review for RLS/grant changes) → iltan review → merge. Small fixes skip
design/plan. End sessions with claude-md-management:revise-claude-md. Exact rules live in CLAUDE.md
("Workflow per iteration").

**Why:** iltan expects problems to be caught earlier and more easily when planning, building, testing and reviewing
are separate (fresh reviewer eyes caught nothing today only because there were none — e.g. the private-function index
that broke the public form was caught by tests, not review).
**How to apply:** no git worktrees (single local Supabase DB), no PRs (local `--no-ff` merge); keep explaining
decisions and stopping at decision points. Related: [[feedback-iterative-collaboration]], [[feedback-record-learnings]].
