/**
 * Thin, typed data-access layer over the Supabase client.
 *
 * DEPENDENCY (Unit 5 — Supabase client): this file imports `createClient`
 * from `../supabase/server` (i.e. `lib/supabase/server.ts`), which does not
 * exist on this branch yet. The import path and the assumed shape of
 * `createClient` (a function — sync or async — returning a Supabase client
 * typed with `Database` from `./types`, following the standard `@supabase/ssr`
 * server-client pattern used in Next.js server components/route handlers) are
 * a contract with Unit 5, not a real, working import as of this commit. If
 * Unit 5 lands with a different export name or signature (e.g. an async
 * factory, a differently-named export, or a client-only helper), the calls
 * to `createClient()` below will need a follow-up patch to match.
 *
 * DEPENDENCY (Unit 1 — schema foundation): all query shapes assume the table
 * contract hand-written in `./types.ts`, which itself documents its own
 * dependency on Unit 1's migration landing with matching column names.
 *
 * LOCAL SCAFFOLDING ONLY — no live project, no real credentials. These
 * functions are not invoked anywhere yet and make no network calls until a
 * real Supabase project + Unit 5's client are in place.
 */

import { createClient } from "../supabase/server";
import type {
  AccessCode,
  Database,
  Override,
  OverrideType,
  SchedulePattern,
  SharedSchedule,
  ShiftSegment,
  TablesInsert,
  TablesUpdate,
  User,
} from "./types";

/**
 * Narrow type for the client we expect `createClient()` to return: a
 * Supabase client parameterized with our `Database` type. Declared locally
 * (rather than importing `SupabaseClient` from `@supabase/supabase-js`)
 * so this file only needs `../supabase/server` to exist and export
 * `createClient` with a compatible return shape — it does not need to know
 * anything else about Unit 5's implementation.
 */
type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getClient(): Promise<TypedSupabaseClient> {
  return await createClient();
}

// =============================================================================
// users
// =============================================================================

export async function getUser(id: string): Promise<User | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateUser(
  id: string,
  patch: TablesUpdate<"users">
): Promise<User> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// =============================================================================
// schedule_patterns
// =============================================================================

export async function getSchedulePattern(
  id: string
): Promise<SchedulePattern | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("schedule_patterns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listSchedulePatternsForUser(
  userId: string
): Promise<SchedulePattern[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("schedule_patterns")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createSchedulePattern(
  pattern: TablesInsert<"schedule_patterns">
): Promise<SchedulePattern> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("schedule_patterns")
    .insert(pattern)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateSchedulePattern(
  id: string,
  patch: TablesUpdate<"schedule_patterns">
): Promise<SchedulePattern> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("schedule_patterns")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchedulePattern(id: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("schedule_patterns").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// shift_segments
// =============================================================================

export async function listShiftSegmentsForPattern(
  schedulePatternId: string
): Promise<ShiftSegment[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("shift_segments")
    .select("*")
    .eq("schedule_pattern_id", schedulePatternId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createShiftSegment(
  segment: TablesInsert<"shift_segments">
): Promise<ShiftSegment> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("shift_segments")
    .insert(segment)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Replace all shift segments for a schedule pattern in one call. Callers
 * (e.g. a "save pattern" form) typically edit the whole ordered sequence at
 * once rather than segment-by-segment, so this deletes the existing rows for
 * the pattern and inserts the replacement set. Not wrapped in a DB
 * transaction/RPC here (PostgREST's JS client does not expose ad-hoc
 * multi-statement transactions) — if atomicity across the delete+insert
 * turns out to matter, consider a Postgres function invoked via `.rpc()`
 * instead.
 *
 * `segments` is expected to already be in the caller's intended order;
 * `position` is normalized here to `0..segments.length-1` (overwriting
 * whatever `position` the caller supplied) so the "ordered replacement"
 * contract can't silently produce duplicate/non-sequential positions —
 * the array order IS the source of truth, not the caller-supplied
 * `position` field.
 */
export async function replaceShiftSegments(
  schedulePatternId: string,
  segments: Array<Omit<TablesInsert<"shift_segments">, "schedule_pattern_id" | "position">>
): Promise<ShiftSegment[]> {
  const supabase = await getClient();

  const { error: deleteError } = await supabase
    .from("shift_segments")
    .delete()
    .eq("schedule_pattern_id", schedulePatternId);
  if (deleteError) throw deleteError;

  if (segments.length === 0) return [];

  const { data, error: insertError } = await supabase
    .from("shift_segments")
    .insert(
      segments.map((segment, index) => ({
        ...segment,
        schedule_pattern_id: schedulePatternId,
        position: index,
      }))
    )
    .select("*")
    .order("position", { ascending: true });

  if (insertError) throw insertError;
  return data ?? [];
}

export async function deleteShiftSegment(id: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("shift_segments").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// overrides
// =============================================================================

export interface DateRange {
  /** Inclusive start date, formatted `YYYY-MM-DD`. */
  from: string;
  /** Inclusive end date, formatted `YYYY-MM-DD`. */
  to: string;
}

export async function listOverridesForUser(
  userId: string,
  dateRange?: DateRange
): Promise<Override[]> {
  const supabase = await getClient();
  let query = supabase.from("overrides").select("*").eq("user_id", userId);

  if (dateRange) {
    query = query.gte("date", dateRange.from).lte("date", dateRange.to);
  }

  const { data, error } = await query.order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createOverride(
  override: TablesInsert<"overrides">
): Promise<Override> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("overrides")
    .insert(override)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteOverride(id: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("overrides").delete().eq("id", id);
  if (error) throw error;
}

/** Re-exported so callers of `createOverride` can build a payload without importing from `./types` directly. */
export type { OverrideType };

// =============================================================================
// shared_schedules
// =============================================================================

export async function getSharedSchedule(
  id: string
): Promise<SharedSchedule | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("shared_schedules")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listSharedSchedulesForUser(
  userId: string
): Promise<SharedSchedule[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("shared_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createSharedSchedule(
  sharedSchedule: TablesInsert<"shared_schedules">
): Promise<SharedSchedule> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("shared_schedules")
    .insert(sharedSchedule)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSharedSchedule(id: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("shared_schedules").delete().eq("id", id);
  if (error) throw error;
}

// =============================================================================
// access_codes
// =============================================================================

const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const ACCESS_CODE_LENGTH = 6;
const ACCESS_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h default validity

function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    const index = Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length);
    code += ACCESS_CODE_ALPHABET[index];
  }
  return code;
}

/**
 * Create a new single-use access code for a shared schedule.
 *
 * NOTE on randomness: `Math.random()` is not cryptographically secure. This
 * is acceptable scaffolding for a 6-character human-typed sharing code (not
 * a security-critical secret on its own — see the RLS design notes in
 * `supabase/migrations/0002_rls.sql`, which describe access codes as a
 * "deliberately weaker trust tier" that only grants read access to one
 * shared schedule, redeemed via a service-role edge function). Before this
 * goes anywhere near production, swap in `crypto.randomInt` /
 * `crypto.getRandomValues` for the code alphabet draw.
 *
 * Retries on the (rare) chance the generated code collides with an existing
 * unexpired one, relying on a unique constraint on `access_codes.code` at
 * the DB layer (assumed from Unit 1) to detect the collision.
 */
export async function createAccessCode(
  sharedScheduleId: string,
  options?: { expiresAt?: string; maxAttempts?: number }
): Promise<AccessCode> {
  const supabase = await getClient();
  const expiresAt =
    options?.expiresAt ?? new Date(Date.now() + ACCESS_CODE_TTL_MS).toISOString();
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);

  let lastError: unknown = new Error(
    "createAccessCode: no attempts were made (maxAttempts must be >= 1)"
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("access_codes")
      .insert({
        code: generateAccessCode(),
        shared_schedule_id: sharedScheduleId,
        is_used: false,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (!error) return data;

    lastError = error;
    // Only retry on a unique-violation (duplicate code); anything else
    // (RLS denial, missing FK, etc.) should surface immediately.
    if (error.code !== "23505") throw error;
  }

  throw lastError;
}

/**
 * Redeem an access code: validates that it exists, is unused, and unexpired,
 * then atomically marks it used and returns the associated shared schedule.
 *
 * ATOMICITY CAVEAT: this performs a conditional UPDATE (`is_used = false`
 * in the filter) followed by a SELECT of the related shared schedule, not a
 * single round-trip RPC. The UPDATE itself is atomic and safe against a
 * race between two simultaneous redemption attempts (only one can flip
 * `is_used` from false to true), so double-redemption cannot happen. What
 * this function does NOT guarantee is that the code-owner is a Kairos
 * account rather than the public: per the RLS design notes, redemption is
 * meant to run under `service_role` inside an edge function (not the
 * `authenticated`-scoped path Unit 5's `createClient()` is assumed to
 * produce here) since anonymous callers need to redeem a code before they
 * hold any JWT at all. This function is written generically against
 * whatever client `createClient()` supplies; wiring it to the actual
 * service-role client is Unit 5 / the edge-function owner's responsibility.
 *
 * Returns `null` if the code does not exist, was already used, or has
 * expired (all three are indistinguishable to the caller by design, to
 * avoid leaking which case occurred to an unauthenticated prober).
 */
export async function redeemAccessCode(
  code: string
): Promise<{ accessCode: AccessCode; sharedSchedule: SharedSchedule } | null> {
  const supabase = await getClient();
  const nowIso = new Date().toISOString();

  const { data: accessCode, error: updateError } = await supabase
    .from("access_codes")
    .update({ is_used: true })
    .eq("code", code)
    .eq("is_used", false)
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!accessCode) return null;

  const { data: sharedSchedule, error: selectError } = await supabase
    .from("shared_schedules")
    .select("*")
    .eq("id", accessCode.shared_schedule_id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (!sharedSchedule) return null;

  return { accessCode, sharedSchedule };
}

export async function listAccessCodesForSharedSchedule(
  sharedScheduleId: string
): Promise<AccessCode[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("access_codes")
    .select("*")
    .eq("shared_schedule_id", sharedScheduleId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function revokeAccessCode(id: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("access_codes")
    .delete()
    .eq("id", id)
    .eq("is_used", false);
  if (error) throw error;
}

// Re-export the Database type for convenience so callers can import
// everything they need (`Database`, row types, and query functions) from
// this single module if desired.
export type { Database };
