// `pnpm db:backup` / `pnpm db:push`: production database work that always starts with an encrypted backup.
//
//   node scripts/db/production.mts backup [--local]   back up (production, or the local stack with --local)
//   node scripts/db/production.mts push [--yes]       back up, dry-run, confirm, push, run pgTAP against production
//   node scripts/db/production.mts prune              delete expired backups only (Claude Code SessionStart hook)
//
// Each dump streams through a marker check straight into `gpg --encrypt` (public key in this folder), so no plaintext
// reaches the disk. Backups: ~/ridevibe-backups/<UTC time>/, deleted after 14 days. Runbook:
// docs/runbooks/database-backup.md. The production URL is only ever passed as an argument, never printed.
import { spawn, type StdioOptions } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { pipeline } from "node:stream/promises";
import { parseEnv } from "node:util";
import { backupFolderName, createMarkerCheck, DATA_MARKERS, pruneBackups } from "./backup-files.mts";

const BACKUP_ROOT = join(homedir(), "ridevibe-backups");
const PUBLIC_KEY = join(import.meta.dirname, "backup-key.asc");
const SUPABASE = ["exec", "supabase"];

class Failure extends Error {}

function exitCode(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

/** Runs a command; `quiet` hides its output (prerequisite checks). */
async function run(command: string, args: string[], quiet = false): Promise<number> {
  const stdio: StdioOptions = quiet ? "ignore" : ["inherit", "inherit", "inherit"];
  try {
    return await exitCode(spawn(command, args, { stdio }));
  } catch {
    return 127;
  }
}

/** Runs a command, showing and returning its stdout. */
async function capture(command: string, args: string[]): Promise<{ code: number; stdout: string }> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
  let stdout = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    process.stdout.write(chunk);
  });
  return { code: await exitCode(child), stdout };
}

async function checkPrerequisites(local: boolean): Promise<void> {
  const checks: [string, string[], string][] = [
    ["docker", ["info"], "Docker isn't running: start Docker Desktop first."],
    ["gpg", ["--version"], "gpg is missing."],
  ];
  if (!local) checks.push(["vercel", ["whoami"], "Not logged in to Vercel: run `vercel login`."]);
  for (const [command, args, message] of checks) {
    if ((await run(command, args, true)) !== 0) throw new Failure(message);
  }
  if (!existsSync(PUBLIC_KEY)) throw new Failure(`Backup public key missing: ${PUBLIC_KEY}`);
}

/** Pulls the production env vars into a private temp folder, reads the database URL and deletes the folder. */
async function productionUrl(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ridevibe-env-"));
  const removeDir = () => {
    rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", removeDir);
  try {
    const file = join(dir, ".env");
    if ((await run("vercel", ["env", "pull", "--environment=production", "--yes", file])) !== 0) {
      throw new Failure("`vercel env pull` failed.");
    }
    const url = parseEnv(readFileSync(file, "utf8")).POSTGRES_URL_NON_POOLING;
    if (!url) throw new Failure("POSTGRES_URL_NON_POOLING is not set in the production env vars.");
    return url;
  } finally {
    removeDir();
  }
}

/** One `supabase db dump` streamed through the marker check into gpg. */
async function dumpEncrypted(target: string[], dumpArgs: string[], markers: readonly string[], output: string) {
  const dump = spawn("pnpm", [...SUPABASE, "db", "dump", ...target, ...dumpArgs], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const gpg = spawn(
    "gpg",
    ["--batch", "--yes", "--trust-model", "always", "--recipient-file", PUBLIC_KEY, "--encrypt", "--output", output],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const check = createMarkerCheck(markers);
  const [streamed, dumpCode, gpgCode] = await Promise.allSettled([
    pipeline(dump.stdout, check.transform, gpg.stdin),
    exitCode(dump),
    exitCode(gpg),
  ]);
  if (dumpCode.status !== "fulfilled" || dumpCode.value !== 0) throw new Failure(`Dump failed (${output}).`);
  if (gpgCode.status !== "fulfilled" || gpgCode.value !== 0) throw new Failure(`Encryption failed (${output}).`);
  if (streamed.status !== "fulfilled") throw new Failure(`Streaming the dump failed (${output}).`);
  const missing = check.missing();
  if (missing.length > 0) throw new Failure(`Dump looks incomplete, missing: ${missing.join(", ")}`);
}

async function backup(url: string | null): Promise<string> {
  await pruneBackups(BACKUP_ROOT, new Date());
  await mkdir(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  const name = backupFolderName(new Date(), url === null);
  const partial = join(BACKUP_ROOT, `${name}.partial`);
  await mkdir(partial, { mode: 0o700 });
  const target = url === null ? [] : [`--remote=${url}`];
  try {
    await dumpEncrypted(target, ["--role-only"], [], join(partial, "roles.sql.gpg"));
    await dumpEncrypted(target, [], [], join(partial, "schema.sql.gpg"));
    await dumpEncrypted(
      target,
      ["--data-only", "--use-copy", "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes"],
      DATA_MARKERS,
      join(partial, "data.sql.gpg"),
    );
  } catch (error) {
    await rm(partial, { recursive: true, force: true });
    throw error;
  }
  const folder = join(BACKUP_ROOT, name);
  await rename(partial, folder);
  return folder;
}

async function confirmed(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    console.log("Dry-run above. Re-run with --yes to push.");
    return false;
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("Push these migrations to production? [y/N] ");
  prompt.close();
  return answer.trim().toLowerCase() === "y";
}

async function push(url: string, yes: boolean): Promise<number> {
  const remote = `--remote=${url}`;
  const dryRun = await capture("pnpm", [...SUPABASE, "db", "push", remote, "--dry-run"]);
  if (dryRun.code !== 0) throw new Failure("Dry-run failed; nothing pushed.");
  if (/up to date/i.test(dryRun.stdout)) {
    console.log("Nothing to push.");
    return 0;
  }
  if (!(await confirmed(yes))) return 1;
  if ((await run("pnpm", [...SUPABASE, "db", "push", remote, "--yes"])) !== 0) throw new Failure("Push failed.");
  if ((await run("pnpm", [...SUPABASE, "test", "db", remote, "--yes"])) !== 0) {
    throw new Failure("Pushed, but pgTAP failed against production: check now.");
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [mode, ...flags] = argv;
  if (mode === "prune" && flags.length === 0) {
    const deleted = await pruneBackups(BACKUP_ROOT, new Date());
    if (deleted.length > 0) console.log(`Deleted ${deleted.length} expired database backup(s).`);
    return 0;
  }
  const unknown = flags.filter((flag) => flag !== "--local" && flag !== "--yes");
  if ((mode !== "backup" && mode !== "push") || unknown.length > 0) {
    console.error("Usage: production.mts backup [--local] | push [--yes] | prune");
    return 2;
  }
  const local = flags.includes("--local");
  if (mode === "push" && local) throw new Failure("push only targets production.");

  await checkPrerequisites(local);
  const url = local ? null : await productionUrl();
  const folder = await backup(url);
  console.log(`Backup: ${folder}`);
  if (mode === "backup" || url === null) return 0;
  return push(url, flags.includes("--yes"));
}

process.once("SIGINT", () => {
  process.exit(130);
});

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof Failure)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
