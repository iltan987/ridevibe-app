---
name: feedback-review-in-production
description: iltan may skip the pre-merge review and review a finished branch on production after merge and deploy
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7a8aaec5-6bb8-4c02-8eb0-868d47f41274
  modified: 2026-11-25T13:54:13.526Z
---

When a branch is finished and fully verified (task reviews, final review, security review, pgTAP, E2E), iltan may
choose to review it on production after the merge instead of locally before it ("i will review in production after
merge. if i want any change, then i will ask for it", 2026-11-21, events branch 1).

**Why:** the review process already covers the code; iltan prefers to judge the real feature on the live site and
ask for changes as follow-ups.

**How to apply:** still offer the pre-merge review ([[feedback-iterative-collaboration]]), but when iltan opts for
production review, run the full rollout (merge `--no-ff` → `pnpm db:push --yes` → push `main` → wait for Ready →
post-push checks) and queue anything iltan must do by hand in `docs/follow-ups.md` "Next up". Gated features
(organisers-only) make this low risk.

While almost nobody uses the app yet, iltan tests on production instead of locally ("i am testing in production
because right now almost no one uses the app yet", 2026-11-25): don't restore iltan's local admin after a DB reset
(CLAUDE.md's "restore iltan's local admin before browser review") until iltan asks for it.

For a multi-branch feature iltan may batch all checks to the end ("i want to check all together at the end of events
feature", 2026-11-21). Then keep the gate closed until that check: ship the work behind the gate, iltan reviews on
production, and the step that exposes it to members (opening a gate, release) comes last, after the review.
