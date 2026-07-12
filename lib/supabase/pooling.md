# Connection pooling (PgBouncer / Supavisor)

Kairos runs its Next.js app on Vercel serverless functions. Every function
invocation can spin up in its own execution context and, without pooling,
open its own direct connection to Postgres. Under any real traffic this
exhausts Postgres' connection limit almost immediately — the classic
"serverless + Postgres" connection-exhaustion problem. This doc describes
how connection pooling is configured to avoid that, and the conventions to
follow when wiring it into app code.

Related config: `supabase/config.toml` (`[db.pooler]` section).

## Why transaction-mode pooling, not session-mode

PgBouncer (fronted by Supabase as "Supavisor"/the project pooler) supports
a few pooling modes. Two matter here:

- **Session mode**: a client connection is pinned to one backend Postgres
  connection for the lifetime of the client's session. This preserves full
  Postgres session semantics (e.g. `SET` variables, advisory locks,
  `LISTEN/NOTIFY`, prepared statements across queries) but does nothing to
  reduce the number of backend connections needed — one client session
  still needs one backend connection, held open the whole time.
- **Transaction mode**: a backend connection is only checked out for the
  duration of a single transaction and returned to the pool the moment it
  commits or rolls back. Many client connections can share a small number
  of backend connections over time.

Vercel serverless (and edge) functions are short-lived, highly concurrent,
and do not maintain a persistent connection to anything between
invocations. There is no stable "session" to pin to a backend connection
in the first place, so session-mode pooling buys nothing — it would still
require one backend connection per concurrent function invocation. **Only
transaction mode actually bounds backend connection usage**, by sharing a
small fixed pool across a much larger number of concurrent lambda
invocations. This is why `pool_mode = "transaction"` is set in
`supabase/config.toml`.

Trade-off to be aware of: transaction mode does not support session-level
features like prepared statement caching across calls, advisory locks held
across statements, or `SET` at the session level. App code should avoid
relying on these against the pooled connection (Prisma/Supabase JS clients
used the normal way are fine).

## Connection string convention

Supabase's pooled (PgBouncer/Supavisor) connection string is the normal
Postgres connection string with `?pgbouncer=true` appended, e.g.:

```
postgres://<user>:<password>@<pooler-host>:6543/postgres?pgbouncer=true
```

The `pgbouncer=true` flag tells Postgres clients/ORMs (notably Prisma) to
disable features that are incompatible with transaction-mode pooling, such
as prepared statement caching, since prepared statements can't safely
persist across a pool that hands out a different backend connection per
transaction.

**Kairos environment variable convention** (to be set in Vercel project
settings once a live Supabase project exists — no values are set yet):

| Variable | Purpose | Points at |
|---|---|---|
| `KAIROS_DATABASE_URL` | Default connection string used by app runtime code (API routes, server actions, Prisma Client at request time) | Pooled connection, port `6543`, `?pgbouncer=true` |
| `KAIROS_DIRECT_URL` | Used only for schema migrations and one-off admin scripts | Direct connection, port `5432`, no `pgbouncer` flag |

Rationale for the `KAIROS_`-prefixed names over the Vercel/Prisma defaults
(`POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING`): Kairos does not use
the Vercel Postgres integration, so there's no reason to inherit its
implicit naming, and an explicit `KAIROS_` prefix makes it unambiguous in
shared infra (CI, Vercel dashboard, local `.env`) which variables belong to
this app versus any other database a future integration might add. If
Prisma is used, map these onto `url` / `directUrl` in the Prisma
`datasource` block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("KAIROS_DATABASE_URL")
  directUrl = env("KAIROS_DIRECT_URL")
}
```

Neither variable is set anywhere in this repo. This doc only fixes the
naming convention so app code and infra config agree once a project is
provisioned.

## Recommended pool size

Starting point for a small-to-medium app, set in `supabase/config.toml`:

- `pool_mode = "transaction"`
- `default_pool_size = 15` — backend connections PgBouncer keeps open per
  pool (roughly, per database/user pair)
- `max_client_conn = 200` — max simultaneous client connections PgBouncer
  will accept from the app tier before queuing/rejecting

These are conservative defaults meant to survive Vercel's default
concurrency without hitting Postgres' own max connection limit (Supabase's
smaller compute tiers typically cap total Postgres connections well under
100). **These numbers are not tuned against real traffic** — once Kairos is
live, revisit them using actual Vercel function concurrency, observed
Postgres connection usage in the Supabase dashboard, and the compute tier's
connection ceiling. Increase `default_pool_size` only if Postgres has
headroom; increase `max_client_conn` if functions are being queued/rejected
by PgBouncer under normal load.

## Pooled vs. direct connection: don't run migrations through the pooler

- **Pooled connection** (`KAIROS_DATABASE_URL`, `?pgbouncer=true`, port
  `6543`): used by the running app for normal query traffic. This is what
  API routes, server actions, and request-time Prisma/Supabase client calls
  should use.
- **Direct connection** (`KAIROS_DIRECT_URL`, no `pgbouncer` flag, port
  `5432`): used for schema migrations (`prisma migrate deploy`, Supabase
  CLI migrations, `supabase db push`) and any admin/maintenance scripts.

Migrations must not go through the transaction pooler because DDL
statements, advisory locks used by migration tooling, and multi-statement
transactional migrations rely on session-level guarantees that
transaction-mode pooling does not provide (a migration tool may issue
several statements assuming they share one backend connection/session,
which transaction mode does not guarantee). Running migrations against the
pooler risks partially-applied schema changes or outright migration-tool
errors. Always point migration tooling at the direct connection.
