# Environment learnings (WSL2 on Windows, local machine, CLI tools)

### Docker comes from Docker Desktop (2026-11-07)
- **Symptom:** `The command 'docker' could not be found in this WSL 2 distro` / `failed to connect to the docker API
  at npipe:…` / Supabase `DockerLifecycleInspectError`.
- **Cause (usual):** Docker Desktop isn't running — WSL integration is already enabled for `Ubuntu`. Tell-tale:
  `which docker` → `/mnt/c/Program Files/Docker/…` (Windows CLI) and no `/var/run/docker.sock`.
- **Do:** start it yourself from WSL: `"/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe" &`, then wait until
  `/var/run/docker.sock` exists and `docker info` works (~30–60 s). Only if that fails, check Settings → Resources →
  WSL Integration. It stops after `wsl --shutdown`.
- `pnpm db:start` may fail with `StatusDbNotReadyError … starting` right after Docker boots — the container is
  still healthy-checking; poll `pnpm db:status` instead of restarting.
- Variant (2026-11-26): `/var/run/docker.sock` exists, but `docker ps` / `docker version` print nothing and the binary
  behind the `/usr/bin/docker` link (`/mnt/wsl/docker-desktop/cli-tools/…`) dies with `Bus error`; Supabase reports
  `DockerLifecycleInspectError` / `StatusDbInspectError` and the containers seem gone. Docker Desktop died under WSL:
  start it as above (ready in ~15 s); containers and volumes come back with `pnpm db:start`, data intact.
- **Source:** found by testing (2026-11-08: Docker was simply not running, WSL integration was fine).

### Local Supabase won't start: Windows reserved its ports (2026-11-17)
- **Symptom:** `supabase start` fails with `ports are not available: exposing port TCP 0.0.0.0:54322 … /forwards/expose
  returned unexpected status: 500`; containers run but no host port is bound.
- **Cause:** Windows (WinNAT/Hyper-V) reserves dynamic TCP ranges at boot; that day it held 54259–54358, covering
  54321–54324. Check: `/mnt/c/Windows/System32/netsh.exe interface ipv4 show excludedportrange protocol=tcp`.
- **Do:** quit Docker Desktop first, then in an admin PowerShell `net stop winnat; net start winnat`, then start
  Docker. With Docker still running, `net stop winnat` hung until a reboot (iltan, 2026-11-17); a reboot also clears
  the reservation. Don't change our ports for it: the ranges move at every boot.
- **Source:** found by testing.

### WSL network can drop entirely (2026-11-07)
- **Symptom:** DNS failures *and* `ping 1.1.1.1` fails.
- **Cause:** not investigated.
- **Do:** check Windows internet; then `wsl --shutdown` in PowerShell and reopen (restart Docker Desktop after).
- **Source:** not recorded.

### Missing CLI tools (2026-11-07)
- No `whois`/`dig` and no sudo assumed. DNS: `https://dns.google/resolve?name=…&type=NS` and Cloudflare DoH
  (`cloudflare-dns.com/dns-query`, header `accept: application/dns-json`); authoritative answers via Node
  `dns.Resolver` + `setServers([ip])`. Domain availability: Vercel MCP `get_bulk_availability` (whois-less).
- **Source:** not recorded.

### Reading official PDFs from kvkk.gov.tr (2026-11-26)
- **Symptom:** `curl` fails with "unable to get local issuer certificate", and so does WebFetch; a kvkk.gov.tr
  `/Icerik/…` link may also serve a PDF rather than HTML. The Read tool can't open PDFs: "pdftoppm is not installed".
- **Cause:** the server sends its certificate without the intermediate (GlobalSign). PDF reading needs poppler-utils
  (installed by iltan 2026-11-26; also gives `pdftotext`, `pdfinfo`).
- **Do:** read the issuer URL from the certificate (`openssl s_client -connect kvkk.gov.tr:443 -servername kvkk.gov.tr
  | openssl x509 -noout -text`, "CA Issuers"), download it, convert with `openssl x509 -inform der`, append it to a
  copy of `/etc/ssl/certs/ca-certificates.crt` and pass that with `curl --cacert` (still verified, unlike `-k`).
  Then `pdftotext -layout file.pdf` and grep the text. Keep downloads in their own scratchpad folder.
- **Source:** found by testing.

### pnpm 12 blocks dependency build scripts (2026-11-07)
- **Do:** list them in `pnpm-workspace.yaml` → `allowBuilds:` (`false` unless needed). Since pnpm 12.7 an install
  without a terminal (Claude's shell) no longer writes `'pkg': set this to true or false` placeholders: a new build
  script shows up only under "Ignored build scripts" in the install output — read it, decide and add the entry.
- Version: the global shim runs `~/.local/share/pnpm`'s copy, which switches to `package.json#packageManager`;
  Vercel uses that pin too (build log "Detected … from package.json#packageManager"). Upgrade: `cd ~ && pnpm
  self-update <ver>`, edit the pin, `pnpm install` (lockfile: only the `@pnpm/exe.*` entries change).
- **Source:** `pnpm-workspace.yaml` (`allowBuilds`), `package.json` (`packageManager`); pnpm 12.7.0 release notes; the
  12.3.4 → 12.23.0 upgrade (2026-11-27).

### Validating pure TS logic quickly (2026-11-07)
- `npx --yes tsx --tsconfig tsconfig.json script.ts` works (path aliases resolve). `pnpm dlx tsx` fails under
  pnpm 12 because esbuild's build script is blocked.
- **Source:** not recorded.

### Vercel CLI is a pnpm global (2026-11-07)
- `npm i -g vercel` does nothing useful here; upgrade with `pnpm add -g vercel@latest`.
- **Source:** `which vercel` → `~/.local/share/pnpm/bin/vercel` (checked 2026-11-25).

### Upgrading the CLIs (2026-11-27)
- **Supabase CLI** (dev dependency, `chore/` branch): read the GitHub releases (`gh release view vX.Y.Z -R
  supabase/cli`) for `db push`/`dump`, migration diffing and `test db`; then `pnpm db:test`, a drift check
  (`pnpm db:migration drift_check`: only the `cron.unschedule` noise) and `pnpm db:push < /dev/null` (backs up, dry-runs
  and stops at "Nothing to push"; with pending migrations the y/N prompt reads nothing and pushes nothing). Confirm the
  dry run's output still matches `/up to date/i` in `scripts/db/production.mts`.
- **Vercel CLI** (pnpm global): since 66 the changelog has commit hashes only and the source isn't public (the repo's
  `packages/cli/CHANGELOG.md` stops at 65.4.0), so test what we use instead: `vercel whoami`, `vercel ls`,
  `vercel env pull --environment=production --yes <file>` (`production.mts` reads `POSTGRES_URL_NON_POOLING`). The
  pull warns that one secret (`CRON_SECRET`, Vercel-sensitive) is written as `[SENSITIVE]`: expected, unused.
- **Source:** the 3.0.0 → 3.4.0 and 66.6.0 → 67.0.0 upgrade (2026-11-27).

### Upgrading dependencies: follow `create-next-app`, skip brand-new majors (2026-11-27)
- **Rule (iltan):** before moving `next`, scaffold a fresh app with its CLI in the scratchpad
  (`pnpm dlx create-next-app@latest probe --ts --eslint --tailwind --app --src-dir --react-compiler --use-pnpm
  --import-alias '@/*' --yes --disable-git`) and match what it pins, above all `react` / `react-dom` (and
  `eslint-config-next`, `babel-plugin-react-compiler`, the `eslint` / `typescript` majors). A newer React patch than
  the template's waits until a Next release ships it. Read the pin's reason in the Next release notes before
  copying it: `create-next-app` 16.4.6 pins `tailwindcss` 4.3.3 only because 4.3.4's `@tailwindcss/node` `require()`s
  ESM-only `magic-string` 1.x, which fails on Node < 20.19 / 22.0–22.11 (vercel/next.js#101061); on Node 24+ newer
  Tailwind patches are fine.
- **Rule (iltan):** a major released only days ago waits (many changes, early bugs); take it once it has settled and
  its ecosystem has caught up. Check release dates with `npm view <pkg> time --json`.
- Peer ranges decide what's blocked: `npm view <pkg>@<ver> peerDependencies`. 2026-11-27: ESLint 10 is blocked by
  `eslint-config-next`'s `eslint-plugin-react` / `-import` / `-jsx-a11y` (ESLint ≤ 9); TypeScript 7 by
  `typescript-eslint` (`typescript < 6.1.0`; TS 7 has no JavaScript API, which type-aware lint needs).
- Lockfile: don't regenerate it wholesale (delete + install). Update direct dependencies by name, then `pnpm dedupe`
  and `pnpm audit`. A fresh lockfile moves every transitive package at once and can cross majors through loose
  ranges (2026-11-27 trial: 44 packages, incl. `intl-messageformat` 11 → 12 under next-intl) while fixing nothing
  `audit` flags (exact pins upstream). To measure one: copy `package.json` + `pnpm-workspace.yaml` into the scratchpad
  and `pnpm install --lockfile-only --ignore-scripts`; the lockfile holds two YAML documents (pnpm's own binaries
  first), so compare the last `packages:` section.
- Not a rule, a fact: the template's `typescript: ^5` / `@types/node: ^20` are floors, not limits. Next 16.4 runs the
  project's own `tsc` in `next build` and documents TS 6 and 7 support (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`).
- **Source:** `create-next-app@16.4.6` scaffold (2026-11-27: `react` 19.3.0 while 19.3.1 was out since 2026-10-14).

### Stopping a server: never `pkill -f` / `pgrep -f` with a pattern from your own command (2026-11-07)
- **Symptom:** `pkill -f "next start -p 3123"` killed the running shell (exit 144) mid-command; another Bash call
  ended with exit 144 right after `pkill -f "next-server"` while the server kept running.
- **Cause:** `-f` matches full command lines, including the `bash -c '…pkill -f next-server…'` that runs it.
- **Do:** stop servers by port: `kill $(ss -ltnp | grep ':3123 ' | grep -oP 'pid=\K[0-9]+')`, or `pgrep -x next-server`.
- **Source:** found by testing (2026-11-07, 2026-11-08).

### `docker exec` ignores piped SQL without `-i` (2026-11-10)
- **Symptom:** `docker exec <db> psql … <<'SQL' … SQL` (or `<<EOF`) prints nothing and changes nothing.
- **Cause:** without `-i`, docker doesn't attach stdin, so psql never receives the heredoc.
- **Do:** `docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'` (`ON_ERROR_STOP=1` makes a
  failed statement loud); check counts afterwards.
- **Source:** found by testing (members E2E fixtures, 2026-11-10; fixture cleanup, 2026-11-12).

### Secrets handling in commands (2026-11-07)
- Pull production env to the scratchpad (`vercel env pull --environment=production <scratchpad file>`), `chmod 600`,
  read single keys with `grep | cut`, mask URLs in output (`sed`), delete the file afterwards. Never print secrets;
  check `.env` contents by key names and format only.
- **Source:** not recorded.

### Claude Code memory and plugins are per machine unless committed (2026-11-09)
- **Symptom:** auto memory, plugins and permissions existed only on one PC; a fresh clone would lose them.
- **Cause:** auto memory lives in `~/.claude/projects/<project>/memory/` and permissions in the git-ignored
  `.claude/settings.local.json`; plugins are installed per machine.
- **Do:** `.claude/settings.json` (committed) holds `autoMemoryDirectory` (must be absolute or `~/`, so it assumes the
  clone at `~/projects/ridingclub`; honored after the folder-trust dialog), permissions, `idleCompaction` and
  `enabledPlugins`. Memory files are committed in `.claude/memory/`. Enabled plugins still need
  `claude plugin install <id> --scope project` once per machine (README loop); `claude plugin list` shows
  "enabled in project settings but isn't installed" otherwise.
- **Marketplaces:** `anthropic-plugin-directory` is built in ("Anthropic Directory", `claude plugin marketplace list`)
  and tracks upstream (superpowers 6.x); `claude-plugins-official` had an older superpowers (5.1.0). Keep the
  directory IDs for superpowers / claude-md-management / context7 / frontend-design; typescript-lsp, figma and vercel
  are only in `claude-plugins-official`. Never enable the same plugin from both (duplicate skills).
- **Check:** `claude -p "print your auto memory directory path"` → `…/ridingclub/.claude/memory/`.
- **Source:** code.claude.com/docs/en/memory (autoMemoryDirectory), settings-reference, plugins/install; found by
  testing.

### Windows GPU tools run from WSL (2026-11-09)
- **Do:** for GPU work (e.g. Real-ESRGAN `realesrgan-ncnn-vulkan.exe` from the official GitHub release) run the
  Windows `.exe` directly from WSL and pass paths through `wslpath -w` (input, output and `-m models` dir). No CUDA/
  Vulkan setup in WSL needed. `realesrgan-x4plus` beat `-anime` on the club badge (sharper, keeps texture).
- **Source:** found by testing (design pass).

### Headless Chrome for PNG/PDF exports (2026-11-09)
- **Do:** `google-chrome --headless=new --screenshot=… --window-size=W,H --force-device-scale-factor=2
  --virtual-time-budget=8000` (budget lets web fonts load). `--print-to-pdf` with CSS `@page{size:…}` may still split
  into 2 pages; for a guaranteed one-page PDF print an HTML page that only contains the PNG at the page size.
  Local images need `--allow-file-access-from-files`. Emoji render as boxes (no emoji font in WSL).
- **Source:** found by testing.

### One-off image work: sharp from Next's own dependency (2026-11-13)
- **Need:** resize, convert or blur an image (share image, home-page photos) without adding a package; sharp is not a
  dependency of ours, only of `next`.
- **Do:** run the script from the repo root and load sharp through Next:
  `require(require.resolve('sharp', { paths: [require.resolve('next', { paths: [process.cwd()] })] }))`. A scratchpad
  script can't resolve `next` relative to itself, so the shorter `require.resolve('next')` fails there. Uses: the share
  image (`seo.md`, "Share image") and partial blur (next entry).
- **Source:** found by testing (share image and home-page photos, 2026-11-13).

### sharp: blurring part of a photo (2026-11-13)
- **Symptom:** a whole-image soft blur (blur a copy, `joinChannel` a feathered mask as alpha, composite over the
  original) blurred the *entire* photo — or nothing at all on another photo — although the mask itself was correct.
- **Cause:** sharp runs operations in its own fixed pipeline order, not call order: `.removeAlpha()` after
  `.joinChannel()` drops the new alpha channel (output had 3 channels). The other failure was not pinned down.
- **Do:** blur per region: extract a padded patch, `.blur()` it, build its RGBA buffer by hand (RGB from the patch,
  alpha from a feathered SVG rect via `.extractChannel(0).raw()`), `composite([{ input, raw: { width, height,
  channels: 4 }, left, top }])`. Then zoom into the output and check by eye; also check `metadata().exif` is unset.
  Load sharp as in the entry above.
- **Source:** found by testing (home-page photos, 2026-11-13).
