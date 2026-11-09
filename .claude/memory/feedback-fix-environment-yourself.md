---
name: feedback-fix-environment-yourself
description: "In WSL, start Docker Desktop (or other host tools) yourself when they're down instead of asking iltan"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8b84aa60-4d77-470f-a96f-f520f7629323
  modified: 2026-11-08T18:04:02.733Z
---

When a local dependency is down (e.g. Docker Desktop not running), try to start it yourself — WSL can launch
Windows programs (`"/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe" &`) — before reporting it as a blocker.

**Why:** iltan pointed out (2026-11-08) that I stopped and asked them to enable WSL integration when Docker simply
wasn't running and I could have started it from WSL.
**How to apply:** diagnose first (is it not running vs. misconfigured?), attempt the safe fix (starting an app),
then continue; only ask for things that need their decision or credentials. Related: [[feedback-iterative-collaboration]].
