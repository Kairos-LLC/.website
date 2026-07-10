-- =============================================================================
-- 0002_rls.sql — Row Level Security policies for Kairos
-- =============================================================================
--
-- DEPENDENCY: This migration assumes the schema created by
-- `supabase/migrations/0001_init.sql` (Unit 1 — schema foundation) is already
-- applied. That migration is expected to define the following tables:
--
--   users             (uuid id primary key, recovery-key based identity —
--                       NO email/password columns)
--   schedule_patterns (owned by a user, references users.id)
--   shift_segments    (belongs to a schedule_patterns row, transitively
--                       owned by a user)
--   overrides         (type: 'vacation' | 'extra_shift' | 'on_call', owned
--                       by a user)
--   shared_schedules  (links a user's schedule for sharing with others)
--   access_codes      (6-char single-use code granting read access to a
--                       shared_schedules row)
--
-- If 0001_init.sql has not landed yet, applying this migration will fail
-- (ALTER TABLE / CREATE POLICY against nonexistent tables). Apply 0001
-- first. Column names referenced below (e.g. `user_id`, `schedule_pattern_id`,
-- `shared_schedule_id`, `code`, `used_at`) are the assumed contract between
-- the two units; if Unit 1 lands with different names, this file will need
-- a follow-up patch to match.
--
-- =============================================================================
-- IDENTITY STRATEGY (read this before touching any policy below)
-- =============================================================================
--
-- Kairos has no traditional account system: there is no `auth.users` table,
-- no email/password, and therefore no `auth.uid()` to rely on for RLS. The
-- product's identity primitive is a *recovery key* — a high-entropy secret
-- generated client-side (or server-side and shown once) that a user must
-- present to prove ownership of a `users` row. There is no login session in
-- the traditional sense; possession of the recovery key IS the credential.
--
-- We still want Postgres-native RLS (not just app-layer checks) because it's
-- the only enforcement point that can't be bypassed by a bug in application
-- code. To get RLS working without `auth.uid()`, we adopt the following
-- approach, which is the standard Supabase pattern for non-Supabase-Auth
-- identity models:
--
-- 1. RECOVERY-KEY VALIDATION HAPPENS OUTSIDE THE DATABASE'S RLS LAYER.
--    A server-side edge function (or backend route) accepts a recovery key,
--    looks up (or derives) the matching `users.id`, and — only on success —
--    mints a Supabase-compatible JWT. That JWT is signed with the project's
--    JWT secret and includes a custom claim:
--
--        { "role": "authenticated", "user_id": "<users.id uuid>", ... }
--
--    This is NOT `auth.uid()` (that column/function belongs to Supabase Auth
--    and is unused here — no row in this schema is ever created via
--    supabase.auth). Instead, policies below read the custom claim through
--    `auth.jwt()`, via the helper function `kairos_current_user_id()`
--    defined below. This keeps every policy's identity check in one place,
--    so if the claim name or extraction path ever changes, only the helper
--    needs updating.
--
-- 2. THE CLIENT SENDS THAT JWT ON EVERY SUPABASE REQUEST (as the standard
--    `Authorization: Bearer <jwt>` header). PostgREST/Supabase already
--    populates `request.jwt.claims` from a valid JWT automatically — no
--    custom session wiring needed for this part.
--
-- 3. ACCESS CODES ARE A SEPARATE, DELIBERATELY WEAKER TRUST TIER. A holder
--    of a valid access code is NOT a `user` and never obtains a `user_id`
--    claim. Instead, the client (after collecting the 6-char code from the
--    person sharing it) calls an edge function that validates the code
--    against `access_codes` and, on success, mints a short-lived, narrowly
--    scoped JWT containing:
--
--        { "role": "authenticated", "access_code_id": "<access_codes.id>" }
--
--    (no `user_id` claim). Policies on `shared_schedules` accept EITHER a
--    matching `user_id` (the owner) OR a valid `access_code_id` claim that
--    maps to an access_codes row pointing at that shared_schedules row via
--    `kairos_current_access_code_id()`. This means the "credential" for
--    reading a shared schedule is minted once, at code-redemption time, and
--    is itself just a JWT claim thereafter — the code string itself is
--    never sent on subsequent reads, only the JWT.
--
-- 4. WHY NOT A RAW GUC / `set_config` PER REQUEST INSTEAD OF A JWT CLAIM?
--    Supabase's PostgREST layer does not accept arbitrary custom headers as
--    session GUCs without extra proxy config, but it DOES automatically
--    parse and expose every claim inside a verified JWT via
--    `current_setting('request.jwt.claims', true)::jsonb`. Piggybacking on
--    that existing, already-verified pipeline means we get tamper-proof
--    claims for free (Postgres never sees a claim that wasn't signed by the
--    project's JWT secret), instead of trusting a client-supplied GUC that
--    nothing authenticates. This is the reasoning for using custom JWT
--    claims minted post-validation rather than passing the recovery key or
--    access code directly on each request.
--
-- 5. SERVICE ROLE. The edge functions described above (recovery-key
--    validation, access-code redemption, access-code issuance) run with the
--    Supabase `service_role` key, which bypasses RLS entirely (Postgres
--    superuser-like `BYPASSRLS` behavior via Supabase's service role). This
--    is required because, e.g., looking up a user BY recovery key cannot
--    itself be gated by a policy that requires already knowing who the user
--    is. All policies in this file therefore apply to the `authenticated`
--    role (holders of a validated, app-issued JWT) and implicitly do not
--    restrict `service_role`.
--
-- 6. SINGLE-USE ACCESS CODES. Postgres RLS (`CREATE POLICY`) can restrict
--    which rows are visible/writable, but it cannot atomically express
--    "the first read/redemption consumes this row and all subsequent ones
--    fail" as a pure SELECT policy without also blocking the legitimate
--    redeemer's own read. We therefore split the enforcement:
--      - DB-LAYER (this migration): the `used_at timestamptz` column is
--        assumed to come from 0001; this migration additionally adds a
--        unique partial index (`access_codes_code_unused_uidx`, below) so
--        two concurrent redemption attempts can't both succeed by racing
--        an UPDATE against a duplicate `code` value, plus an UPDATE policy
--        that only allows setting `used_at` once (see policy
--        `access_codes_mark_used` below) — together these are the "reject
--        if already used" transactional backstop at the DB layer.
--      - APP-LAYER (edge function, NOT in this repo/migration): the
--        redemption edge function must run the SELECT-then-UPDATE as a
--        single transaction (`UPDATE access_codes SET used_at = now()
--        WHERE code = $1 AND used_at IS NULL RETURNING *`) using the
--        service role, and treat zero rows returned as "invalid or already
--        used." This is called out explicitly because a naive
--        read-then-write from application code (two round trips) would be
--        racy; doing it as one atomic UPDATE...RETURNING closes that gap.
--        The policy below is a defense-in-depth backstop for any client
--        that somehow holds an `authenticated` JWT and attempts the update
--        directly, not the primary enforcement mechanism.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions: extract identity claims from the request JWT.
-- SECURITY: STABLE (not VOLATILE) and scoped to the current request via
-- Postgres GUCs that Supabase/PostgREST populates per-request from the
-- verified JWT. Defined with SQL (not plpgsql) for minimal overhead since
-- these run on every row check.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION kairos_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'user_id',
    ''
  )::uuid
$$;

COMMENT ON FUNCTION kairos_current_user_id() IS
  'Returns the users.id encoded in the custom "user_id" claim of the '
  'caller''s JWT (minted post recovery-key validation), or NULL if absent '
  '(e.g. an access-code-only session, or an unauthenticated request).';

CREATE OR REPLACE FUNCTION kairos_current_access_code_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'access_code_id',
    ''
  )::uuid
$$;

COMMENT ON FUNCTION kairos_current_access_code_id() IS
  'Returns the access_codes.id encoded in the custom "access_code_id" claim '
  'of the caller''s JWT (minted post access-code redemption), or NULL if '
  'absent. A session carries at most one of user_id / access_code_id.';

-- =============================================================================
-- users
-- =============================================================================
-- No email/password: a row is only ever readable/writable by the identity
-- that owns it, proven via the `user_id` JWT claim. There is intentionally
-- no policy allowing lookup of a user by any other user — usernames/recovery
-- keys are never enumerable through the API.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_select_self
  ON users
  FOR SELECT
  TO authenticated
  USING (id = kairos_current_user_id());

CREATE POLICY users_update_self
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = kairos_current_user_id())
  WITH CHECK (id = kairos_current_user_id());

-- No INSERT/DELETE policy for `authenticated`: user rows are created by the
-- recovery-key-issuance edge function under service_role (account creation
-- precedes having a JWT at all), and deletion (account/data erasure) is
-- also routed through a service_role edge function so it can cascade
-- cleanup (shared_schedules, access_codes, etc.) consistently.

-- =============================================================================
-- schedule_patterns
-- =============================================================================
-- Directly owned by a user via `user_id`. Full CRUD for the owner only.

ALTER TABLE schedule_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_patterns FORCE ROW LEVEL SECURITY;

CREATE POLICY schedule_patterns_select_own
  ON schedule_patterns
  FOR SELECT
  TO authenticated
  USING (user_id = kairos_current_user_id());

CREATE POLICY schedule_patterns_insert_own
  ON schedule_patterns
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = kairos_current_user_id());

CREATE POLICY schedule_patterns_update_own
  ON schedule_patterns
  FOR UPDATE
  TO authenticated
  USING (user_id = kairos_current_user_id())
  WITH CHECK (user_id = kairos_current_user_id());

CREATE POLICY schedule_patterns_delete_own
  ON schedule_patterns
  FOR DELETE
  TO authenticated
  USING (user_id = kairos_current_user_id());

-- Read access for shared-schedule viewers (access-code holders) is handled
-- entirely through the `shared_schedules` / `access_codes` policies below —
-- NOT by granting broader access here. The recommended shape for Unit 1 (or
-- a follow-up) is a view (e.g. `shared_schedule_patterns`) that joins
-- schedule_patterns to shared_schedules and is exposed to access-code
-- holders, rather than relaxing RLS on the base table itself. This keeps
-- "can edit my own schedule" and "can view a schedule shared with me" as
-- non-overlapping policy surfaces on the source of truth table.

-- =============================================================================
-- shift_segments
-- =============================================================================
-- Belongs to a schedule_patterns row; ownership is transitive through
-- schedule_pattern_id -> schedule_patterns.user_id. There is no direct
-- user_id column assumed on this table (per the documented schema), so
-- policies subquery through schedule_patterns.

ALTER TABLE shift_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_segments FORCE ROW LEVEL SECURITY;

CREATE POLICY shift_segments_select_own
  ON shift_segments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM schedule_patterns sp
      WHERE sp.id = shift_segments.schedule_pattern_id
        AND sp.user_id = kairos_current_user_id()
    )
  );

CREATE POLICY shift_segments_insert_own
  ON shift_segments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM schedule_patterns sp
      WHERE sp.id = shift_segments.schedule_pattern_id
        AND sp.user_id = kairos_current_user_id()
    )
  );

CREATE POLICY shift_segments_update_own
  ON shift_segments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM schedule_patterns sp
      WHERE sp.id = shift_segments.schedule_pattern_id
        AND sp.user_id = kairos_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM schedule_patterns sp
      WHERE sp.id = shift_segments.schedule_pattern_id
        AND sp.user_id = kairos_current_user_id()
    )
  );

CREATE POLICY shift_segments_delete_own
  ON shift_segments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM schedule_patterns sp
      WHERE sp.id = shift_segments.schedule_pattern_id
        AND sp.user_id = kairos_current_user_id()
    )
  );

-- =============================================================================
-- overrides (type: vacation | extra_shift | on_call)
-- =============================================================================
-- Directly owned by a user via `user_id`, same shape as schedule_patterns.
-- The `type` enum/check constraint itself is Unit 1's concern; RLS here only
-- gates row ownership, not which `type` values are legal.

ALTER TABLE overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE overrides FORCE ROW LEVEL SECURITY;

CREATE POLICY overrides_select_own
  ON overrides
  FOR SELECT
  TO authenticated
  USING (user_id = kairos_current_user_id());

CREATE POLICY overrides_insert_own
  ON overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = kairos_current_user_id());

CREATE POLICY overrides_update_own
  ON overrides
  FOR UPDATE
  TO authenticated
  USING (user_id = kairos_current_user_id())
  WITH CHECK (user_id = kairos_current_user_id());

CREATE POLICY overrides_delete_own
  ON overrides
  FOR DELETE
  TO authenticated
  USING (user_id = kairos_current_user_id());

-- =============================================================================
-- shared_schedules
-- =============================================================================
-- A shared_schedules row is created by its owner (`user_id`) to expose
-- read-only visibility of their schedule to whoever redeems a matching
-- access_codes entry. Readable by:
--   (a) the owner themselves (so they can manage/revoke their own shares), or
--   (b) a caller whose JWT carries an `access_code_id` claim that points, via
--       access_codes.shared_schedule_id, at this row. This covers BOTH a
--       code that has just been redeemed and one redeemed previously in an
--       earlier session — see the design note above ("valid, unused (or
--       previously validated) access_code"): once an access-code session JWT
--       has been minted, the holder keeps read access to that specific
--       shared_schedules row for the lifetime of that JWT (short expiry is
--       an edge-function/JWT-config concern, not RLS). This is deliberate:
--       an access code is a one-time REDEMPTION action (consuming the code
--       row), not a one-time VIEW action — a viewer shouldn't lose access to
--       a schedule mid-session just because they refreshed the page.
--
-- Only the owner can INSERT/UPDATE/DELETE (create, edit share settings, or
-- revoke a share). Access-code holders never get write access here.

ALTER TABLE shared_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY shared_schedules_select_owner
  ON shared_schedules
  FOR SELECT
  TO authenticated
  USING (user_id = kairos_current_user_id());

CREATE POLICY shared_schedules_select_via_access_code
  ON shared_schedules
  FOR SELECT
  TO authenticated
  USING (
    kairos_current_access_code_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM access_codes ac
      WHERE ac.id = kairos_current_access_code_id()
        AND ac.shared_schedule_id = shared_schedules.id
    )
  );

CREATE POLICY shared_schedules_insert_owner
  ON shared_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = kairos_current_user_id());

CREATE POLICY shared_schedules_update_owner
  ON shared_schedules
  FOR UPDATE
  TO authenticated
  USING (user_id = kairos_current_user_id())
  WITH CHECK (user_id = kairos_current_user_id());

CREATE POLICY shared_schedules_delete_owner
  ON shared_schedules
  FOR DELETE
  TO authenticated
  USING (user_id = kairos_current_user_id());

-- =============================================================================
-- access_codes
-- =============================================================================
-- access_codes rows are minted by the owning user (via their own edge
-- function call or directly, both under the owner's `user_id`) for a
-- specific shared_schedules row they own. Redemption (looking up a code by
-- its plaintext value to mint an access-code JWT) happens under
-- service_role in an edge function and is therefore NOT covered by any
-- policy below — `authenticated` callers cannot SELECT access_codes by
-- guessing/entering a code string directly; only the service-role
-- redemption function can do that lookup. This prevents enumeration/brute
-- forcing of codes through the normal API surface.
--
-- SINGLE-USE ENFORCEMENT (see design note 6 above for full reasoning):
--   - The authoritative check is an atomic `UPDATE ... WHERE used_at IS
--     NULL ... RETURNING` performed by the service-role redemption edge
--     function — that is application code, not part of this migration.
--   - As defense in depth, the UPDATE policy below still prevents an
--     `authenticated` caller (e.g. the owner, who CAN see their own codes)
--     from flipping `used_at` back to NULL to "reset" a code, and prevents
--     setting `used_at` on a code that isn't theirs.

ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes FORCE ROW LEVEL SECURITY;

-- Defense-in-depth for single-use: even though `code` is presumed unique
-- overall (Unit 1's concern), this partial unique index specifically
-- guards the redemption window by ensuring at most one *unused* row can
-- exist per code value at a time, so a duplicate-code edge case can't be
-- exploited to redeem "the same" code twice concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS access_codes_code_unused_uidx
  ON access_codes (code)
  WHERE used_at IS NULL;

CREATE POLICY access_codes_select_owner
  ON access_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM shared_schedules ss
      WHERE ss.id = access_codes.shared_schedule_id
        AND ss.user_id = kairos_current_user_id()
    )
  );

CREATE POLICY access_codes_insert_owner
  ON access_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM shared_schedules ss
      WHERE ss.id = access_codes.shared_schedule_id
        AND ss.user_id = kairos_current_user_id()
    )
  );

-- Owner may revoke (delete) an unused code, e.g. to stop sharing before
-- anyone redeems it. Already-used codes are kept for the owner's audit
-- trail (e.g. "who has viewed my schedule") rather than deleted.
CREATE POLICY access_codes_delete_owner_unused
  ON access_codes
  FOR DELETE
  TO authenticated
  USING (
    used_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM shared_schedules ss
      WHERE ss.id = access_codes.shared_schedule_id
        AND ss.user_id = kairos_current_user_id()
    )
  );

-- Defense-in-depth backstop described above: allows marking a code used
-- exactly once, and only forward (NULL -> timestamp), never backward. The
-- primary enforcement remains the service-role atomic UPDATE in the
-- redemption edge function.
CREATE POLICY access_codes_mark_used
  ON access_codes
  FOR UPDATE
  TO authenticated
  USING (
    used_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM shared_schedules ss
      WHERE ss.id = access_codes.shared_schedule_id
        AND ss.user_id = kairos_current_user_id()
    )
  )
  WITH CHECK (
    used_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM shared_schedules ss
      WHERE ss.id = access_codes.shared_schedule_id
        AND ss.user_id = kairos_current_user_id()
    )
  );

-- No general UPDATE-any-column policy is granted beyond the above: the
-- WITH CHECK on access_codes_mark_used only constrains used_at's
-- transition, but note that Postgres RLS UPDATE policies do not restrict
-- *which* columns change — only whether the resulting row satisfies WITH
-- CHECK and the pre-image satisfied USING. If tighter column-level control
-- is later required (e.g. preventing the owner from also rewriting `code`
-- on the same UPDATE), add a `REVOKE UPDATE (code) ON access_codes FROM
-- authenticated; GRANT UPDATE (used_at) ON access_codes TO authenticated;`
-- pair, since column privileges compose with RLS policies.

-- =============================================================================
-- End of 0002_rls.sql
-- =============================================================================
