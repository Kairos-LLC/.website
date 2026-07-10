/**
 * Supabase client factory for use in Client Components (browser context).
 *
 * Uses `createBrowserClient` from `@supabase/ssr` — the current recommended
 * approach for Next.js + Supabase, replacing the deprecated
 * `@supabase/auth-helpers-nextjs` package.
 *
 * Usage (inside a Client Component, i.e. a file with `"use client"`):
 *
 *   import { createClient } from "@/lib/supabase/client";
 *
 *   const supabase = createClient();
 *   const { data, error } = await supabase.from("some_table").select("*");
 *
 * Only ever call this with the public anon key. It is safe to expose to the
 * browser: Row Level Security policies (see Unit 2) are what actually
 * protect data, not the secrecy of this key.
 */
import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "../db/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Creates a new Supabase client scoped to the browser. Safe to call
 * multiple times (e.g. once per component) — `@supabase/ssr` manages the
 * underlying session via cookies, so separate instances stay in sync.
 */
export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project values."
    );
  }

  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
