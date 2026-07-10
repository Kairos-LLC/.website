'use client';

import { useEffect, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
// DEPENDENCY (Unit 5, work/unit-05-supabase-client): this hook assumes a
// browser-side Supabase client factory at lib/supabase/client.ts exporting
// `createClient()` that returns a `SupabaseClient` configured with the
// project URL/anon key (via @supabase/ssr's `createBrowserClient` or
// equivalent). That file does not exist on this branch as of writing — see
// the unit's task note. If Unit 5 lands with a different export shape
// (default export, differently named factory, etc.) this import will need
// a follow-up patch to match.
import { createClient } from '../lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
//
// Column shapes below mirror the hints given in Unit 4's channel contract
// (lib/supabase/realtime-channels.md) and the `overrides` table description
// in supabase/migrations/0002_rls.sql / 0003_realtime.sql: `overrides` has a
// `type` of 'vacation' | 'extra_shift' | 'on_call', a `shared_schedule_id`
// FK, and a start/end time range. Unit 1's actual migration
// (supabase/migrations/0001_init.sql) is the source of truth for exact
// column names and has not landed on this branch as of writing — these
// types are intentionally permissive (index signature) so this hook does
// not silently drop fields Unit 1 defines that aren't anticipated here, and
// will need a follow-up patch once 0001_init.sql lands to tighten them up.
// ---------------------------------------------------------------------------

export type OverrideType = 'vacation' | 'extra_shift' | 'on_call';

export interface ScheduleOverride {
  id: string;
  shared_schedule_id: string;
  type: OverrideType;
  starts_at: string;
  ends_at: string;
  [key: string]: unknown;
}

export interface SharedSchedule {
  id: string;
  [key: string]: unknown;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface ScheduleSyncState {
  /** The shared_schedules row for this id, once loaded/synced. Null until the first UPDATE arrives or a caller seeds it. */
  sharedSchedule: SharedSchedule | null;
  /** Current set of overrides for this shared schedule, keyed by id. */
  overrides: Record<string, ScheduleOverride>;
}

export interface UseScheduleSyncResult extends ScheduleSyncState {
  status: ConnectionStatus;
  /** The list form of `overrides`, for convenience in render code. */
  overridesList: ScheduleOverride[];
}

type OverridesChangePayload = RealtimePostgresChangesPayload<ScheduleOverride>;
type SharedScheduleChangePayload = RealtimePostgresChangesPayload<SharedSchedule>;

/**
 * Merges an incoming `overrides` postgres_changes event into a state map.
 * Exported (not just used internally) so it can be exercised directly by a
 * unit test without needing a live Supabase channel.
 */
export function applyOverrideChange(
  current: Record<string, ScheduleOverride>,
  payload: OverridesChangePayload,
): Record<string, ScheduleOverride> {
  switch (payload.eventType) {
    case 'INSERT':
    case 'UPDATE': {
      const row = payload.new as ScheduleOverride;
      if (!row || !row.id) return current;
      return { ...current, [row.id]: row };
    }
    case 'DELETE': {
      // REPLICA IDENTITY FULL means `old` is the complete previous row, so
      // `old.id` is reliably present (see realtime-channels.md).
      const oldRow = payload.old as Partial<ScheduleOverride> | null | undefined;
      const id = oldRow?.id;
      if (!id || !(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    }
    default:
      return current;
  }
}

/**
 * Subscribes to Supabase Realtime `postgres_changes` events for a given
 * `shared_schedule_id`, per the channel convention documented in
 * lib/supabase/realtime-channels.md (Unit 4):
 *
 *   - channel name: `schedule:{shared_schedule_id}`
 *   - `overrides` table: INSERT / UPDATE / DELETE, filtered on
 *     `shared_schedule_id=eq.{shared_schedule_id}`
 *   - `shared_schedules` table: UPDATE only, filtered on
 *     `id=eq.{shared_schedule_id}`
 *
 * This hook only manages the subscription and merges incoming events into
 * local state — it does not perform an initial fetch of existing rows.
 * Callers are expected to seed initial state (e.g. via a server component
 * or a one-time fetch) separately; this hook keeps that state live
 * thereafter without requiring a full refetch on every change.
 *
 * NOTE ON AUTH PRECONDITION: per realtime-channels.md, RLS gates both
 * tables on a valid access-code-derived session. This hook does not
 * validate or establish that session itself — callers must ensure a valid
 * session exists (via Unit 5's client / the access-code validation flow)
 * before mounting this hook, or the channel will open but silently
 * deliver nothing.
 */
export function useScheduleSync(sharedScheduleId: string): UseScheduleSyncResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [state, setState] = useState<ScheduleSyncState>({
    sharedSchedule: null,
    overrides: {},
  });

  useEffect(() => {
    if (!sharedScheduleId) {
      setStatus('disconnected');
      return;
    }

    // Guards every async callback below against firing after this effect's
    // cleanup has run (unmount, or `sharedScheduleId` changing). Each effect
    // run closes over its own `cancelled`, and React runs this cleanup
    // before the next effect run's setup, so a stale subscription's
    // callbacks always see their own closure's `cancelled === true` and
    // bail out — no separate "which id is active" tracking is needed.
    let cancelled = false;

    // Reset local state when switching to a different schedule id so stale
    // overrides from a previous id don't linger in the merged state.
    setState({ sharedSchedule: null, overrides: {} });
    setStatus('connecting');

    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel(`schedule:${sharedScheduleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'overrides',
          filter: `shared_schedule_id=eq.${sharedScheduleId}`,
        },
        (payload: OverridesChangePayload) => {
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            overrides: applyOverrideChange(prev.overrides, payload),
          }));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shared_schedules',
          filter: `id=eq.${sharedScheduleId}`,
        },
        (payload: SharedScheduleChangePayload) => {
          if (cancelled) return;
          // Guard against a malformed/empty payload: Supabase types `new` as
          // `T | {}` (empty object on some event shapes), and `{}` is
          // truthy, so a bare `!row` check would let an empty object
          // through and clobber `sharedSchedule` with garbage. Require the
          // identifying `id` field to be present instead.
          const row = payload.new as SharedSchedule | undefined;
          if (!row || !row.id) return;
          setState((prev) => ({ ...prev, sharedSchedule: row }));
        },
      )
      .subscribe((subscribeStatus: REALTIME_SUBSCRIBE_STATES) => {
        if (cancelled) return;
        switch (subscribeStatus) {
          case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
            setStatus('connected');
            break;
          case REALTIME_SUBSCRIBE_STATES.CLOSED:
          case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
          case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
            setStatus('disconnected');
            break;
          default:
            break;
        }
      });

    return () => {
      cancelled = true;
      setStatus('disconnected');
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedScheduleId]);

  const overridesList = Object.values(state.overrides).sort((a, b) =>
    a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0,
  );

  return {
    sharedSchedule: state.sharedSchedule,
    overrides: state.overrides,
    overridesList,
    status,
  };
}
