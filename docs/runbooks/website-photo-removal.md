# Removing or replacing a website photo: runbook

When: a person on a public-site photo withdraws consent, or a photo is replaced for editorial reasons. Photos of
people on the public site need their written consent for the website (CLAUDE.md "Privacy (KVKK)"). Consent proof
(the WhatsApp message) stays with the club, outside the repo.

1. **Code:** remove/replace the file in `src/assets/home/` and its use, merge, deploy. A replacement always gets a
   **new file name**.
2. **Git history:** purge the old path in a fresh clone (recipe: `docs/learnings/tooling.md`, "Scrubbing text from
   history"): `git filter-repo --path src/assets/home/<old-file> --invert-paths` (a same-named replacement would be
   deleted too). Save its "NOTE: First Changed Commit(s)" lines. Check for forks (`gh api repos/iltan987/ridevibe-app
   --jq .forks_count`: forks keep the photo, only their owners can remove it). Force-push `main` (one-off exception to
   merge-only; iltan approves; other clones re-clone).
3. **GitHub cache:** the repo is **public**, and GitHub serves the orphaned commits by SHA until purged. iltan opens a
   ticket at support.github.com (removing sensitive data: personal data, consent withdrawn) with owner/repo, the
   number of affected pull requests (0: we merge locally) and the First Changed Commit(s); Support garbage-collects
   the orphaned commits and cached views. Clones made while the photo was public can't be recalled.
4. **Old Vercel deployments:** checked 2026-11-13: `*.vercel.app` URLs redirect to Vercel login (Protection on), so no
   action. Re-check a production and a preview URL (`curl -sI`, 302 = protected; may differ per environment).
5. **Image cache:** if the old image URL still loads on ridevibe.com.tr, purge the cached image
   (`invalidate_by_src_images` / Vercel dashboard).
6. **Search:** Search Console → "Remove outdated content".
7. Originals and unused photos never enter the repo.
