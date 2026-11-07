# Environment & tooling learnings (WSL2 on Windows)

### Docker comes from Docker Desktop (2026-11-07)
- **Symptom:** `The command 'docker' could not be found in this WSL 2 distro` / `failed to connect to the docker API
  at npipe:…` / Supabase `DockerLifecycleInspectError`.
- **Do:** start Docker Desktop and enable Settings → Resources → WSL Integration for the distro. It stops after
  `wsl --shutdown`.

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
