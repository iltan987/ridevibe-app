# Environment & tooling learnings (WSL2 on Windows)

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

### WSL network can drop entirely (2026-11-07)
- **Symptom:** DNS failures *and* `ping 1.1.1.1` fails.
- **Do:** check Windows internet; then `wsl --shutdown` in PowerShell and reopen (restart Docker Desktop after).

### Missing CLI tools (2026-11-07)
- No `whois`/`dig` and no sudo assumed. DNS: `https://dns.google/resolve?name=…&type=NS` and Cloudflare DoH
  (`cloudflare-dns.com/dns-query`, header `accept: application/dns-json`); authoritative answers via Node
  `dns.Resolver` + `setServers([ip])`. Domain availability: Vercel MCP `get_bulk_availability` (whois-less).

### pnpm 12 blocks dependency build scripts (2026-11-07)
- **Do:** list them in `pnpm-workspace.yaml` → `allowBuilds:` (`false` unless needed). New entries appear as
  `'pkg': set this to true or false` after installs — decide and fix the file.

### Vercel CLI is a pnpm global (2026-11-07)
- `npm i -g vercel` does nothing useful here; upgrade with `pnpm add -g vercel@latest`.

### Don't `pkill -f` with a pattern that matches your own command (2026-11-07)
- **Symptom:** `pkill -f "next start -p 3123"` killed the running shell (exit 144) mid-command.
- **Do:** kill by PID: `kill $(ss -ltnp | grep ':3123 ' | grep -o 'pid=[0-9]*' | cut -d= -f2)`.

### Secrets handling in commands (2026-11-07)
- Pull production env to the scratchpad (`vercel env pull --environment=production <scratchpad file>`), `chmod 600`,
  read single keys with `grep | cut`, mask URLs in output (`sed`), delete the file afterwards. Never print secrets;
  check `.env` contents by key names and format only.

### `pkill -f` / `pgrep -f` match the shell running them (2026-11-08)
- **Symptom:** a Bash call ends with exit 144 right after `pkill -f "next-server"`; the server keeps running.
- **Cause:** `-f` matches full command lines, including the `bash -c '…pkill -f next-server…'` that runs it.
- **Do:** stop servers by port: `kill $(ss -ltnp | grep ':3123 ' | grep -oP 'pid=\K[0-9]+')`, or `pgrep -x next-server`.

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

### Claude Code memory and plugins are per machine unless committed (2026-11-09)
- **Symptom:** auto memory (`~/.claude/projects/<project>/memory/`), plugins and permissions (git-ignored
  `.claude/settings.local.json`) existed only on one PC; a fresh clone would lose them.
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
- **Source:** code.claude.com/docs/en/memory (autoMemoryDirectory), settings-reference, plugins/install; found by testing.

### `docker exec` ignores piped SQL without `-i` (2026-11-12)
- **Symptom:** `docker exec <db> psql … <<'SQL' … SQL` prints nothing and changes nothing.
- **Cause:** without `-i`, docker doesn't attach stdin, so psql never receives the heredoc.
- **Do:** `docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'`; check counts afterwards.
- **Source:** found by testing (fixture cleanup, 2026-11-12).
