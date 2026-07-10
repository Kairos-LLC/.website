-- =============================================================================
-- Kairos LLC — Schema Foundation (Unit 1)
-- =============================================================================
-- Migration: 0001_init.sql
-- Purpose:   Initial schema for Kairos' server-side state. Kairos is a
--            private-by-design scheduling app ("Know when they're free")
--            that identifies users by a recovery key instead of a
--            traditional email/password account. No table in this schema
--            stores an email address, password, or password hash.
--
-- Scope:     This is LOCAL SCAFFOLDING ONLY. No live Supabase project is
--            provisioned or targeted by writing this file, and no network
--            calls are made as part of authoring it.
--
-- Naming:    Where a table mirrors a concept from the existing iOS app
--            (FireScheduleEngine.swift / RecoveryManager.swift), a comment
--            notes the Swift-side name. The Swift sources are referenced
--            for naming consistency only — they are not read in depth here
--            and are not modified by this migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
-- gen_random_uuid() for uuid primary keys.
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------

-- Mirrors the Swift-side job role concept used to select/label a schedule
-- pattern's domain (e.g. which industry's shift conventions apply).
create type job_role as enum (
  'firefighter',
  'medical',
  'lawEnforcement',
  'industrial',
  'transportation',
  'hospitality'
);

-- Mirrors the Swift-side override "type" concept: a schedule exception that
-- applies to a single date for a given user's schedule.
create type override_type as enum (
  'vacation',
  'extra_shift',
  'on_call'
);

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
-- Recovery-key based identity. Kairos has no email/password accounts: a user
-- is identified by possession of a recovery key. We never store the
-- recovery key itself (that payload is client-side encrypted and lives on
-- the client — see the note above the `overrides`/`shared_schedules`
-- section on why there is no `recovery_data` table). Instead we store only
-- a one-way hash of the recovery key so the server can look up a user's
-- record without ever holding secret material that could reconstruct the
-- key.
--
-- Deliberately absent columns: email, username, password, password_hash,
-- phone_number — none of these exist for this identity model, by design.
create table users (
  id uuid primary key default gen_random_uuid(),

  -- One-way hash (e.g. Argon2id/SHA-256, decided at application layer) of
  -- the client-held recovery key. Used only to look up a user's row; it
  -- cannot be reversed to recover the key. Unique so a recovery key maps to
  -- exactly one user.
  recovery_key_hash text not null unique,

  -- Optional job role, mirrors Swift-side job role selection used to pick
  -- default schedule pattern conventions (see job_role enum above).
  job_role job_role,

  -- Display name the user optionally sets for their own reference. Not a
  -- login identifier.
  display_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table users is
  'Recovery-key based identity. Mirrors the account concept implied by '
  'RecoveryManager.swift (not modified, referenced for naming only): a '
  'user is identified by a recovery key, never by email/password.';
comment on column users.recovery_key_hash is
  'One-way hash of the client-held recovery key. The raw key is never '
  'sent to or stored by the server in recoverable form.';

-- -----------------------------------------------------------------------------
-- schedule_patterns
-- -----------------------------------------------------------------------------
-- Mirrors the Swift SchedulePattern struct in FireScheduleEngine.swift (not
-- modified, referenced for naming only): a named, described cycle made up
-- of shift segments (see shift_segments below, which hold the ordered
-- on/off cycle units for a pattern).
create table schedule_patterns (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null references users(id) on delete cascade,

  name text not null,
  description text,

  -- Optional job role association for the pattern (e.g. a firefighter
  -- "48/96" pattern), mirrors the Swift-side job role concept.
  job_role job_role,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table schedule_patterns is
  'Mirrors the Swift SchedulePattern struct in FireScheduleEngine.swift '
  '(not modified, referenced for naming only): id, name, description, and '
  'a cycle of shift segments (see shift_segments).';

create index idx_schedule_patterns_owner_user_id
  on schedule_patterns(owner_user_id);

-- -----------------------------------------------------------------------------
-- shift_segments
-- -----------------------------------------------------------------------------
-- Mirrors the Swift ShiftSegment concept in FireScheduleEngine.swift (not
-- modified, referenced for naming only): the on/off cycle unit. A
-- schedule_pattern's cycle is the ordered list of its shift_segments.
create table shift_segments (
  id uuid primary key default gen_random_uuid(),

  schedule_pattern_id uuid not null references schedule_patterns(id) on delete cascade,

  -- Order of this segment within the pattern's repeating cycle. Zero-based,
  -- unique per pattern so the cycle sequence is well-defined.
  sequence_index integer not null,

  -- Whether this segment is an "on" (working) segment or "off" segment.
  is_on boolean not null,

  -- Duration of this segment, in hours. Whole hours per the Swift model's
  -- `hours` int field.
  hours integer not null check (hours > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_shift_segments_pattern_sequence unique (schedule_pattern_id, sequence_index)
);

comment on table shift_segments is
  'Mirrors the Swift ShiftSegment concept in FireScheduleEngine.swift (not '
  'modified, referenced for naming only): isOn (bool) + hours (int), the '
  'on/off cycle unit that makes up a schedule_pattern''s cycle.';

create index idx_shift_segments_pattern_id
  on shift_segments(schedule_pattern_id);

-- -----------------------------------------------------------------------------
-- overrides
-- -----------------------------------------------------------------------------
-- Mirrors the Swift override concept in FireScheduleEngine.swift (not
-- modified, referenced for naming only): a one-off exception (vacation,
-- extra_shift, or on_call) that applies to a specific date for a user's
-- schedule, overriding whatever the pattern's cycle would otherwise say for
-- that date.
create table overrides (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users(id) on delete cascade,

  -- Which schedule pattern this override applies against. An override is
  -- always scoped to one of the user's own patterns.
  schedule_pattern_id uuid not null references schedule_patterns(id) on delete cascade,

  override_type override_type not null,

  -- The single calendar date this override applies to.
  override_date date not null,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- At most one override per type per date per user/pattern combination.
  constraint uq_overrides_user_pattern_date_type
    unique (user_id, schedule_pattern_id, override_date, override_type)
);

comment on table overrides is
  'Mirrors the Swift override concept in FireScheduleEngine.swift (not '
  'modified, referenced for naming only): type is one of vacation | '
  'extra_shift | on_call, applied to a specific date for a user''s '
  'schedule.';

create index idx_overrides_user_id on overrides(user_id);
create index idx_overrides_schedule_pattern_id on overrides(schedule_pattern_id);
create index idx_overrides_override_date on overrides(override_date);

-- -----------------------------------------------------------------------------
-- shared_schedules
-- -----------------------------------------------------------------------------
-- A user's schedule (pattern + start date + overrides) as shared/viewed by
-- others. This is the "publish" boundary: a shared_schedule snapshots which
-- pattern is shared and the cycle's start date, and access to it is granted
-- to other people via access_codes (see below). Overrides for the
-- underlying user/pattern (the `overrides` table above) remain live and are
-- read alongside the shared_schedule at view time rather than being copied,
-- so viewers always see current vacations/extra shifts/on-calls.
create table shared_schedules (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null references users(id) on delete cascade,
  schedule_pattern_id uuid not null references schedule_patterns(id) on delete cascade,

  -- The calendar date the pattern's shift cycle is anchored to, i.e. the
  -- date at which sequence_index = 0 of the pattern's shift_segments
  -- begins. Combined with the pattern's cycle, this lets a viewer compute
  -- on/off status for any date.
  cycle_start_date date not null,

  -- Whether this share link is currently active. Owners can revoke a share
  -- without deleting its history/access_codes audit trail.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table shared_schedules is
  'A user''s schedule (schedule_pattern + cycle start date; overrides read '
  'live from the overrides table) as shared/viewed by others. Mirrors the '
  'sharing concept layered on top of the Swift SchedulePattern model in '
  'FireScheduleEngine.swift (not modified, referenced for naming only).';

create index idx_shared_schedules_owner_user_id on shared_schedules(owner_user_id);
create index idx_shared_schedules_schedule_pattern_id on shared_schedules(schedule_pattern_id);

-- -----------------------------------------------------------------------------
-- access_codes
-- -----------------------------------------------------------------------------
-- 6-char single-use alphanumeric codes that grant access to a
-- shared_schedule. A viewer redeems a code once to view a shared_schedule;
-- redemption marks the code used so it cannot grant access again.
create table access_codes (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  shared_schedule_id uuid not null references shared_schedules(id) on delete cascade,

  is_used boolean not null default false,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- 6-char alphanumeric, matches the product's stated code format.
  constraint chk_access_codes_code_format check (code ~ '^[A-Za-z0-9]{6}$')
);

comment on table access_codes is
  '6-char single-use alphanumeric codes that grant access to a '
  'shared_schedule. Redeeming a code sets is_used = true; expires_at '
  'bounds how long an unredeemed code remains valid.';

create index idx_access_codes_shared_schedule_id on access_codes(shared_schedule_id);
create index idx_access_codes_expires_at on access_codes(expires_at);
-- Fast lookup path for "find unused, unexpired codes" during redemption.
create index idx_access_codes_unused on access_codes(code) where is_used = false;

-- -----------------------------------------------------------------------------
-- Why there is no `recovery_data` table
-- -----------------------------------------------------------------------------
-- Kairos' recovery key / recovery data (the backup payload a user can use
-- to restore their data on a new device) is a client-side encrypted blob by
-- design: it is generated, encrypted, and decrypted entirely on-device
-- (mirrors RecoveryManager.swift, not modified, referenced for naming
-- only), and the server never needs — and must never hold — a decryptable
-- copy of it. The server only ever sees `users.recovery_key_hash`, a
-- one-way hash used purely to look up a user's row. Persisting the backup
-- payload itself server-side would undermine the "private-by-design, no
-- traditional account" model, so intentionally no `recovery_data` table is
-- defined in this schema.

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
-- Shared trigger function so every table's updated_at column is maintained
-- automatically on UPDATE, rather than relying on every call site to set it.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_schedule_patterns_set_updated_at
  before update on schedule_patterns
  for each row execute function set_updated_at();

create trigger trg_shift_segments_set_updated_at
  before update on shift_segments
  for each row execute function set_updated_at();

create trigger trg_overrides_set_updated_at
  before update on overrides
  for each row execute function set_updated_at();

create trigger trg_shared_schedules_set_updated_at
  before update on shared_schedules
  for each row execute function set_updated_at();

-- Note: access_codes intentionally has no updated_at/trigger — it is
-- write-once-then-flip-is_used, not a general mutable record.
