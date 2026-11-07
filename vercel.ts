import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  // Run server code in Frankfurt, next to the Supabase database (eu-central-1)
  // and close to Istanbul. Also keeps request processing in the EU (KVKK).
  regions: ["fra1"],
};
