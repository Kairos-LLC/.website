/**
 * Placeholder for the generated Supabase database types.
 *
 * TODO(Unit 7): Replace this file with the real generated types, e.g. via
 *   supabase gen types typescript --project-id <project-ref> > lib/db/types.ts
 *
 * Until then, `Database` is typed as `any` so the Supabase client factories
 * in `lib/supabase/client.ts` and `lib/supabase/server.ts` compile and type
 * against *something* without depending on Unit 7 landing first. Once the
 * real generated file lands here, `createBrowserClient<Database>()` and
 * `createServerClient<Database>()` will automatically pick up full
 * table/row/RPC typing with no changes required in the client factories.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
