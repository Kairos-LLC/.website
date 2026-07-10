/**
 * Supabase client factory for use in Server Components, Route Handlers, and
 * Server Actions (server context).
 *
 * Uses `createServerClient` from `@supabase/ssr` with the `getAll`/`setAll`
 * cookie pattern documented at https://supabase.com/docs/guides/auth/server-side/nextjs
 * — the current recommended approach for Next.js App Router + Supabase,
 * replacing the deprecated `@supabase/auth-helpers-nextjs` package.
 *
 * Usage (inside a Server Component, Route Handler, or Server Action):
 *
 *   import { createClient } from "@/lib/supabase/server";
 *
 *   const supabase = await createClient();
 *   const { data, error } = await supabase.from("some_table").select("*");
 *
 * Notes:
 * - This factory must be called *within* a request scope (it reads the
 *   incoming request's cookies via `next/headers`), so create a fresh
 *   client per request/render rather than caching one at module scope.
 * - Server Components cannot write cookies (Next.js will throw). The
 *   `setAll` call below is wrapped in a try/catch for exactly that reason —
 *   if this factory is used from a Server Component, cookie writes
 *   (session refresh) are silently skipped there and are expected to
 *   happen in middleware instead (see Supabase's documented
 *   `updateSession` middleware pattern — not yet added to this repo).
 *   Route Handlers and Server Actions *can* write cookies, so refresh
 *   works normally there.
 * - Only ever call this with the public anon key here — this client still
 *   respects Row Level Security (see Unit 2) using the caller's session.
 *   For privileged server-only operations that must bypass RLS, use the
 *   `SUPABASE_SERVICE_ROLE_KEY` in a dedicated admin client, never this one.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "../db/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Creates a new Supabase client scoped to the current request, wired up to
 * read/write the auth session via Next.js's `cookies()` API.
 *
 * Must be awaited: `next/headers`'s `cookies()` is async in Next.js 15+ and
 * this factory forwards that requirement so it compiles against either
 * Next.js 14 (sync `cookies()`, still valid to `await` a non-promise) or 15+.
 */
export async function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project values."
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — cookies can't be set here.
          // Safe to ignore as long as session refresh also happens in
          // middleware (see the note above about the `updateSession`
          // middleware pattern, not yet added to this repo).
        }
      },
    },
  });
}
