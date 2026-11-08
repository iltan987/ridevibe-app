import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  // Run server code in Frankfurt, next to the Supabase database (eu-central-1)
  // and close to Istanbul. Also keeps request processing in the EU (KVKK).
  regions: ["fra1"],
  // Keep the Free plan Supabase project active. Hobby allows each cron only
  // once a day (±59 min), so the same endpoint is scheduled three times (UTC).
  crons: [
    { path: "/api/keep-alive", schedule: "0 3 * * *" },
    { path: "/api/keep-alive", schedule: "0 11 * * *" },
    { path: "/api/keep-alive", schedule: "0 19 * * *" },
  ],
};
