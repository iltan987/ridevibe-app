# Ride & Vibe

Club platform for Ride & Vibe, an Istanbul motorcycle club. Production: https://ridevibe.com.tr (fallback: https://ridevibe-app.vercel.app)

- Plan & decisions: [`docs/PLAN.md`](docs/PLAN.md)
- Application form spec: [`docs/application-form.md`](docs/application-form.md)
- Conventions for humans and Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Requirements

- Node.js 24, pnpm
- Docker Desktop (on Windows: enable WSL integration for your distro)

## Local setup

```bash
pnpm install
pnpm db:start        # starts local Supabase (first run downloads images)
pnpm dev             # http://localhost:3000
```

Local Supabase Studio: http://127.0.0.1:54323

## Making yourself admin (once per environment)

Sign in once so your profile exists, then run in the SQL editor (Studio locally, Supabase dashboard in production):

```sql
update public.profiles
set role_id = (select id from public.roles where is_admin), status = 'active'
where id = (select id from auth.users where email = 'you@example.com');
```

After that, manage roles at `/admin/roles` and members at `/admin/members`.
