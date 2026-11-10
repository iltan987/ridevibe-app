---
name: feedback-remove-dead-code
description: "Remove dead code when there is no reason to keep it, in the same change; plus periodic dead-code sweeps"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e0e229db-f2d4-4bb7-a0cc-c76930f6ffde
  modified: 2026-11-10T21:39:51.251Z
---

Remove dead code (unused exports, helpers, message keys, leftovers from a replaced approach) as soon as it becomes
dead, in the same change, unless there is a stated reason to keep it. Also run a dead-code sweep now and then.

**Why:** iltan said (2026-11-11) cleaning dead code is important and should happen regularly, after a session where an
unused helper (`isValidBirthDate`) was written and then removed before commit.

**How to apply:** before each commit, check whether the change made anything unused and delete it. A periodic sweep
item lives in `docs/follow-ups.md` ("Dead-code sweep"); a tool like `knip` needs iltan's OK to install
([[feedback-missing-tools-ask]]). Rule also in CLAUDE.md "Working agreement".
