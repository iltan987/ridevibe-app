---
name: feedback-paginate-lists
description: Never cap lists with a fixed limit — every list/query that can grow must paginate; club grows fast
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8b84aa60-4d77-470f-a96f-f520f7629323
  modified: 2026-11-08T17:57:13.312Z
---

Every list in the app (applications, members, events, RSVPs, photos, …) must be paginated (or otherwise scale) —
never a silent fixed cap like `.limit(200)`. Also check counts/aggregates don't silently fail.

**Why:** iltan rejected `listApplications` capped at 200 rows: the club reached ~130 people in ~2 weeks
(Nov 2026) and keeps growing. A silent cap hides data from admins.
**How to apply:** design every new query/screen with pagination from the start (keyset/cursor or page+count),
show totals, and flag any existing cap during reviews. Related: [[project-ridingclub]].
