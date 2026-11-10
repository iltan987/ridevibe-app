---
name: feedback-track-follow-ups
description: Every deferred/parked/out-of-scope item goes into docs/follow-ups.md in the same commit; read it before planning
metadata:
  node_type: memory
  type: feedback
  originSessionId: 77b07ce2-c65a-4ef5-9649-083eadab5df9
  modified: 2026-11-10T01:41:20.184Z
---

Record every deferred, parked or out-of-scope item (review minors, edge cases, follow-up features, open decisions) in
`docs/follow-ups.md`, in the same commit as the work. Read that file before planning any iteration and bring the
relevant items up with iltan.

**Why:** after the application-gaps iteration (2026-11-10) the deferred minors and parked edge cases lived only in the
SDD ledger under `.superpowers/` (git-ignored, deleted after the plan), so a new session could not have found them.
iltan asked that they always be noted so any session can check them.

**How to apply:** before deleting an SDD workspace or finishing a branch, copy every `minor (deferred)`, `parked` and
"Not in scope" line into `docs/follow-ups.md`; when presenting a plan, mention follow-ups that touch the same area.
Related: [[feedback-record-learnings]], [[feedback-agentic-workflow]].
