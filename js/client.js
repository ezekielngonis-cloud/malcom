import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
export const ready = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("PASTE_");
export const db = ready ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
export const setupHint = "Configure js/config.js with your Supabase Project URL and public anon/publishable key.";
