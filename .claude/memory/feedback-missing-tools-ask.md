---
name: feedback-missing-tools-ask
description: "Never silently skip a step because a tool/command isn't installed — ask to install it, or ask iltan to"
metadata:
  node_type: memory
  type: feedback
  originSessionId: eb06d5d0-d3b4-47bc-8e6a-bf11b1b0d452
  modified: 2026-11-10T02:59:22.823Z
---

If a tool, CLI, package or setup a step needs is missing, don't skip the step or replace it with a weaker check.
Ask iltan for approval to install it (say what, where, and why), or ask iltan to install/set it up when I can't
(e.g. needs sudo or an interactive login: suggest `! <command>`).

**Why:** iltan said so on 2026-11-10 while approving the loading-states plan (browser E2E with puppeteer/Chrome,
signed-in test users); skipped verification hides gaps.

**How to apply:** check tool availability before a task starts, list what's missing in one message with the exact
install command, wait for approval. Related: [[feedback-fix-environment-yourself]] (environment things like Docker I
start myself; installing new things needs approval).
