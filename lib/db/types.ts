/**
 * Hand-written stand-in for Supabase's generated database types.
 *
 * NORMALLY this file is produced by:
 *
 *   supabase gen types typescript --project-id <project-ref> --schema public > lib/db/types.ts
 *
 * There is no live Supabase project for Kairos yet, so `supabase gen types`
 * has nothing to introspect. This file hand-authors the same shape the CLI
 * would emit (a `Database` type with `public.Tables.<table>.{Row,Insert,Update}`)
 * so that:
 *
 *   1. `lib/db/queries.ts` and application code can be written and typechecked
 *      today against a realistic contract, and
 *   2. once a real Supabase project exists and the schema in
 *      `supabase/migrations/` (Unit 1 — schema foundation) is applied, this
 *      file can be deleted and replaced with the CLI-generated output with
 *      no changes required to `queries.ts` or its callers, ASSUMING the
 *      generated shape matches what's hand-written below.
 *
 * SCHEMA SOURCE OF TRUTH / KNOWN DEPENDENCY:
 * The table/column shapes below come from the Unit 7 task spec, cross-checked
 * against `supabase/migrations/0002_rls.sql` (Unit 2 — RLS policies) where
 * that migration was visible on disk at authoring time. Unit 1 (schema
 * foundation, `supabase/migrations/0001_init.sql`) had not landed on this
 * branch as of writing. If Unit 1 lands with different column names, nullability,
 * or additional tables/columns, this file must be regenerated (or manually
 * reconciled) to match — it is NOT a substitute for the real migration, only
 * a typed contract that mirrors the spec in the meantime.
 *
 * One naming discrepancy to flag explicitly for that reconciliation: the RLS
 * migration's design notes describe single-use enforcement on `access_codes`
 * via a `used_at timestamptz` column, whereas the Unit 7 spec (and this file)
 * uses `is_used boolean` + `expires_at`. Both are plausible designs; whichever
 * Unit 1 actually ships determines which one is correct. Do not assume this
 * file is right without checking against the landed migration.
 *
 * LOCAL SCAFFOLDING ONLY — no live project, no real credentials, no network
 * calls originate from this file.
 *
 * `Relationships` foreign-key names below follow Postgres/Supabase's default
 * `<table>_<column>_fkey` naming convention and are a best-effort guess, not
 * a fact about Unit 1's migration — the actual generated types will use
 * whatever names the real constraints get (explicit or default). Nothing in
 * `queries.ts` depends on these names; they only exist for shape parity with
 * real generated output (some codegen/tooling consumers expect the key to be
 * present).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** `users.job_role` enum. */
export type JobRole =
  | "firefighter"
  | "medical"
  | "lawEnforcement"
  | "industrial"
  | "transportation"
  | "hospitality";

/** `overrides.type` enum. */
export type OverrideType = "vacation" | "extra_shift" | "on_call";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          job_role: JobRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_role: JobRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_role?: JobRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      schedule_patterns: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_patterns_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      shift_segments: {
        Row: {
          id: string;
          schedule_pattern_id: string;
          position: number;
          is_on: boolean;
          hours: number;
        };
        Insert: {
          id?: string;
          schedule_pattern_id: string;
          position: number;
          is_on: boolean;
          hours: number;
        };
        Update: {
          id?: string;
          schedule_pattern_id?: string;
          position?: number;
          is_on?: boolean;
          hours?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shift_segments_schedule_pattern_id_fkey";
            columns: ["schedule_pattern_id"];
            isOneToOne: false;
            referencedRelation: "schedule_patterns";
            referencedColumns: ["id"];
          }
        ];
      };

      overrides: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          type: OverrideType;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          type: OverrideType;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          type?: OverrideType;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "overrides_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      shared_schedules: {
        Row: {
          id: string;
          user_id: string;
          schedule_pattern_id: string;
          start_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          schedule_pattern_id: string;
          start_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          schedule_pattern_id?: string;
          start_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shared_schedules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shared_schedules_schedule_pattern_id_fkey";
            columns: ["schedule_pattern_id"];
            isOneToOne: false;
            referencedRelation: "schedule_patterns";
            referencedColumns: ["id"];
          }
        ];
      };

      access_codes: {
        Row: {
          id: string;
          code: string;
          shared_schedule_id: string;
          is_used: boolean;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          shared_schedule_id: string;
          is_used?: boolean;
          created_at?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          code?: string;
          shared_schedule_id?: string;
          is_used?: boolean;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "access_codes_shared_schedule_id_fkey";
            columns: ["shared_schedule_id"];
            isOneToOne: false;
            referencedRelation: "shared_schedules";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      job_role: JobRole;
      override_type: OverrideType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// -----------------------------------------------------------------------------
// Convenience aliases, mirroring the helper types Supabase's own docs
// recommend layering on top of the generated `Database` type.
// -----------------------------------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type User = Tables<"users">;
export type SchedulePattern = Tables<"schedule_patterns">;
export type ShiftSegment = Tables<"shift_segments">;
export type Override = Tables<"overrides">;
export type SharedSchedule = Tables<"shared_schedules">;
export type AccessCode = Tables<"access_codes">;
