import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Vercel cron (see vercel.ts): a real query a few times a day keeps the Free
// plan Supabase project from being paused for inactivity. Vercel sends
// `Authorization: Bearer $CRON_SECRET`; anything else gets 401.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("keep_alive");
  if (error || !data) {
    console.error("keep-alive failed", { code: error?.code });
    return Response.json({ ok: false }, { status: 503 });
  }
  return Response.json({ ok: true });
}

function isAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
