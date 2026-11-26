---
name: feedback-keep-tools-updated
description: iltan wants CLI/tool update notices acted on (planned as work), not ignored as noise
metadata:
  type: feedback
---

When a tool prints "a new version is available" (Supabase CLI, Vercel CLI, others), don't dismiss it as noise:
mention it and plan the update (backlog item or its own small `chore/` branch, with the release notes checked).

**Why:** iltan, 2026-11-26, after the Supabase CLI notices during `db:push`: "new versions are kind of important".

**How to apply:** finish the task at hand first, then propose the update; dev dependencies go through a branch and
the usual checks, global CLIs are installed directly after checking their changelog for commands the repo scripts
use. Related: [[user-iltan]].
