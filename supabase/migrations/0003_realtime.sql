-- 0003_realtime.sql
-- Realtime channel schema: enable Supabase Realtime (postgres_changes) on
-- the tables that back live availability sync.
--
-- DEPENDENCY: This migration assumes the schema introduced by Unit 1
-- (work/unit-01-schema-foundation, not yet landed on this branch as of
-- writing) already exists, specifically:
--   - public.shared_schedules  (a user's schedule as shared/viewed by others)
--   - public.overrides         (type: vacation | extra_shift | on_call,
--                                tied to a user's schedule)
-- plus the supporting tables users, schedule_patterns, shift_segments, and
-- access_codes, which this migration does not touch directly. If Unit 1's
-- migration has not been applied yet, this migration will fail with an
-- "undefined table" error — apply 0001/0002 (schema + RLS, Units 1 and 2)
-- before this one.
--
-- This migration is schema/config only: it does not create tables, and it
-- does not contain any client subscription code (see
-- lib/supabase/realtime-channels.md for the documented channel contract,
-- and Unit 8's hooks/useScheduleSync.ts for the actual client subscriber,
-- which is out of scope here).

-- ---------------------------------------------------------------------------
-- 1. Add tables to the supabase_realtime publication.
--
-- Supabase provisions a logical replication publication named
-- `supabase_realtime` by default; only tables added to it emit
-- `postgres_changes` events over Realtime. Neither table is added by
-- default, so both must be added explicitly.
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.overrides;

-- ---------------------------------------------------------------------------
-- 2. Set REPLICA IDENTITY FULL on both tables.
--
-- By default a table's replica identity is its primary key, which means
-- logical replication (and therefore postgres_changes) only includes the
-- primary key columns in the "old record" payload for UPDATE/DELETE events
-- -- not the rest of the row. Client-side diffing of availability state
-- (e.g. figuring out which time range an override used to cover before an
-- UPDATE, or what an override looked like right before a DELETE) needs the
-- full previous row, not just its id. REPLICA IDENTITY FULL makes Postgres
-- include all columns of the old row in the WAL record for UPDATE/DELETE,
-- which Supabase Realtime then surfaces as the `old` field of the
-- postgres_changes payload.
--
-- Trade-off (documented, not acted on here): REPLICA IDENTITY FULL
-- increases WAL volume for these tables since the full old row is logged on
-- every UPDATE/DELETE, not just changed columns. Both tables are expected
-- to be low-write (schedule/override edits, not high-frequency data), so
-- this is an acceptable trade for correct client-side diffing.
-- ---------------------------------------------------------------------------

ALTER TABLE public.shared_schedules REPLICA IDENTITY FULL;
ALTER TABLE public.overrides REPLICA IDENTITY FULL;
