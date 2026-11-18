import { z } from "zod";

/** A staff note: trimmed, 1–2,000 characters (mirrors the `member_notes.body` check). Dependency-free for `node --test`. */
export const NOTE_MAX_LENGTH = 2000;
export const noteBodySchema = z.string().trim().min(1).max(NOTE_MAX_LENGTH);
