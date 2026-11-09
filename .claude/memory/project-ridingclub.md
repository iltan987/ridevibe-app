---
name: project-ridingclub
description: "Club app requirements — motorcycle club, Istanbul districts/sides, TR+EN, KVKK, Android+iOS, WhatsApp group, live at ridevibe.com.tr"
metadata:
  node_type: memory
  type: project
  originSessionId: b89e4765-0cbb-411f-ac19-2c9ee1a2de49
  modified: 2026-11-07T23:10:21.736Z
---

Club name: **Ride & Vibe**. Domain: **ridevibe.com.tr** (bought by iltan, 2026-11-07). Live on Vercel since 2026-11-08 (DNS on Vercel); no email sending yet.

Account ownership (decided 2026-11-07): all services (GitHub, Vercel, Supabase, Google Cloud, domain) run under **iltan's personal accounts** — iltan is the long-term administrator and code owner; no shared club account (Samet isn't technical and shared passwords are a risk). Don't suggest a club account again; do keep a handover/emergency-access note in mind.

Progress (2026-11-09): application form, admin review, roles and the "Gece + turkuaz" design system are live on ridevibe.com.tr, and **real users are using the app** (testers reported problems; handle production carefully, push only when asked). Next: MVP screens (members, events with routes, announcements) per docs/PLAN.md.

KVKK (2026-11-08): club is an informal group → Samet should be data controller (iltan asks him at MVP time); iltan wants to avoid a lawyer unless truly needed; retention via anonymisation. Open items tracked in docs/PLAN.md KVKK section.

Samet is involved now (picked the design, sets the WhatsApp photos); iltan forwards questions to him in Turkish.

Building a club platform (started 2026-11-07) for a motorcycle (not horse) club in Istanbul, ~150 members. 

Phase 1 agreed: public landing page (Instagram ad traffic, ad attribution), application form replacing Google Forms (form questions still to be discussed with iltan), admin panel/member list, events + RSVP + announcements, event photo galleries.
Phase 2 interest: attendance — QR check-in alone is too slow when crowded, wants multiple attendance methods.

Constraints: everyone logs in (Claude decides which pages are public); Turkish + English (more languages later); city defaults to Istanbul but editable, district and Asian/European side matter more; must work on Android and iOS; KVKK compliance is important; club communicates via a WhatsApp group; domain ridevibe.com.tr is live (email sending still deferred).

Related: [[user-iltan]], [[feedback-dev-rules]].
