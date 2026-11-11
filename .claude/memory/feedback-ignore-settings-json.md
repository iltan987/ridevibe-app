---
name: feedback-ignore-settings-json
description: "Don't raise, commit or ask about uncommitted .claude/settings.json changes until iltan says otherwise"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1c50c3c3-8db0-4768-bd32-17bc390ddbd9
  modified: 2026-11-11T17:54:03.622Z
---

Ignore local changes to `.claude/settings.json`: don't commit, revert or ask about them, and don't list them in
summaries, until iltan explicitly says otherwise (said 2026-11-11).

**Why:** iltan keeps their own permission tweaks there and doesn't want a prompt about it every session.
**How to apply:** leave the file unstaged when committing (stage by path, never `git add -A`); this overrides the
"nothing lives only on one PC" rule for this one file. Related: [[feedback-dev-rules]].
