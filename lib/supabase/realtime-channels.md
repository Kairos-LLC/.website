# Realtime channel schema

This doc describes the Supabase Realtime contract for live availability
sync: which tables emit changes, how channels should be named, what events
and payloads to expect, and the auth precondition that must hold before
Realtime will actually deliver anything.

Related migration: `supabase/migrations/0003_realtime.sql` (adds
`shared_schedules` and `overrides` to the `supabase_realtime` publication
and sets `REPLICA IDENTITY FULL` on both).

**This is documentation only.** It does not contain client subscription
code. Client-side subscribers (the actual `supabase.channel(...)` calls,
React state wiring, etc.) belong to a separate unit — Unit 8,
`hooks/useScheduleSync.ts`. Treat this file as the spec that unit should be
built against.

## Dependency note

This doc and its migration assume the table schema introduced by Unit 1
(`work/unit-01-schema-foundation`): `users`, `schedule_patterns`,
`shift_segments`, `overrides`, `shared_schedules`, `access_codes`. As of
writing, that schema has not necessarily landed on `main` yet — this unit
was written in parallel and does not block on it. If you're implementing
against this doc and the tables don't exist, apply Unit 1's (and Unit 2's
RLS) migrations first.

## Channel naming convention: one channel per shared schedule

**Convention:** `schedule:{shared_schedule_id}`

e.g. a shared schedule with id `3f29...` gets the Realtime channel name
`schedule:3f29...`.

**Why per-schedule channels instead of a single global broadcast channel:**

- **Scoping matches access control.** A `shared_schedules` row (and the
  `overrides` tied to it) is only visible to whoever holds a valid
  access-code-derived session for that specific schedule (see the "Auth
  precondition" section below). A per-schedule channel lets each client
  subscribe only to the one schedule it has been granted access to, and
  lets Postgres RLS do the filtering at the source. A single global channel
  would either require broadcasting every schedule's changes to every
  subscriber (a privacy leak, directly against Kairos's private-by-design
  premise) or require the same server-side row-level filtering plus an
  extra application-level re-filter on every client, for no benefit over
  just scoping the channel.
- **Cheap fan-out, cheap teardown.** A viewer only ever cares about one
  schedule at a time (the one they were given an access code for). Per-
  schedule channels mean a client subscribes on mount and unsubscribes on
  unmount with no shared-state bookkeeping, and Kairos never pays to
  deliver changes for schedules nobody is currently viewing.
- **Natural fit for `postgres_changes` filters.** Supabase's
  `postgres_changes` subscriptions support a `filter` option
  (`shared_schedule_id=eq.<id>`) that pairs naturally with a channel name
  keyed on the same id, keeping the channel name and the row filter
  conceptually in sync for anyone reading the code later.

A broadcast-style channel (e.g. a single `availability` channel with
client-side routing by id) was considered and rejected for the privacy
reason above: it's a worse default for a schema whose whole point is that
one user's schedule is only visible to holders of that schedule's access
code.

## Events to listen for

Two tables are Realtime-enabled (see `0003_realtime.sql`). Subscribers
should listen for:

| Table | Events | Why |
|---|---|---|
| `overrides` | `INSERT`, `UPDATE`, `DELETE` | Overrides (vacation / extra_shift / on_call) are added, edited, and removed independently of the base schedule; all three event types are meaningful state changes a viewer needs to reflect. |
| `shared_schedules` | `UPDATE` | The shared schedule row itself changes when the underlying schedule pattern it points to is edited or when sharing settings change. `INSERT`/`DELETE` on `shared_schedules` are not expected to matter to an already-subscribed client, since a client only subscribes to a channel for a schedule it already knows the id of; a new share doesn't affect an existing subscription, and a deleted share should be handled via the access-revocation/session-invalidation path rather than treated as a live diffing event. |

Each table's events should be scoped with a `postgres_changes` filter on
`shared_schedule_id` (the FK on `overrides`, and the primary/identifying
column on `shared_schedules` itself) matching the channel's id, per the
naming convention above.

## Expected payload shape

Supabase's standard `postgres_changes` payload applies unmodified — this
migration does not customize it. Every event delivered to a subscriber has
this shape:

```jsonc
{
  "eventType": "INSERT" | "UPDATE" | "DELETE",
  "schema": "public",
  "table": "overrides" | "shared_schedules",
  "new": { /* full row after the change; {} for DELETE */ },
  "old": { /* full row before the change; {} for INSERT */ },
  "commit_timestamp": "2026-07-10T00:00:00Z",
  "errors": null
}
```

Notes specific to this schema:

- Because `0003_realtime.sql` sets `REPLICA IDENTITY FULL` on both tables,
  `old` is the **complete previous row**, not just the primary key, for
  `UPDATE` and `DELETE` events. This is what makes client-side diffing
  possible — e.g. on an `overrides` `UPDATE`, comparing `old.starts_at`/
  `old.ends_at` against `new.starts_at`/`new.ends_at` to figure out what
  time range changed, or on `DELETE`, knowing what the removed override
  covered without a separate fetch.
- Without `REPLICA IDENTITY FULL` (i.e. the Postgres default of
  `REPLICA IDENTITY DEFAULT`, primary key only), `old` would contain only
  the row's `id` on `UPDATE`/`DELETE`, which is insufficient for diffing
  and is precisely why the migration sets it explicitly.
- `new`/`old` field names and types mirror the actual `overrides` /
  `shared_schedules` column definitions from Unit 1's migration; this doc
  does not restate that column list since it should be treated as the
  source of truth once it lands.

## Auth precondition: session must exist before subscribing

`shared_schedules` and `overrides` are expected to be protected by
row-level security policies gating access on a valid, access-code-derived
session (Unit 2's RLS policies). Supabase Realtime enforces the same RLS
policies as normal Postgres queries when authorization is enabled on the
channel (`postgres_changes` respects RLS using the subscriber's JWT).

Practically, this means: **a client must already hold a valid
session/token obtained by successfully validating an access code before
subscribing to `schedule:{shared_schedule_id}`.** Subscribing without such
a session will not error loudly — it will simply never receive events for
rows that RLS would not let that session `SELECT`, which looks like a
silently-dead channel rather than a rejected connection. Any implementer
building the client subscriber (Unit 8) should validate the access code
and establish the session first, and treat "channel is open but delivering
nothing" as an authorization symptom to check for, not just a network
symptom.
