# Liquid glass UI + motion + copy overhaul

## Goal

Give the landing page and dashboard an Apple-like "liquid glass" visual
treatment, add restrained modern motion, and rewrite the copy to reflect
Kairos's actual mission (privacy-first scheduling via a recovery key, no
accounts) — without adding new dependencies or changing the existing
minimal layout structure.

## Context

Current landing/dashboard (`app/page.tsx`, `app/dashboard/page.tsx`) are
flat, plain-white, system-font pages with one purple accent (`#6d5efc`).
`app/globals.css` declares `color-scheme: light dark` but has no actual
dark-mode styling. No background art exists, so a `backdrop-filter: blur()`
glass effect would render invisibly over flat white — it needs a colored,
textured backdrop to read as "glass."

## Visual system

- `app/globals.css`: fixed, full-viewport animated gradient-mesh backdrop —
  2–3 soft blurred blobs in purple/blue tones derived from `#6d5efc`,
  animated via `@keyframes` with slow drift. Paused under
  `prefers-reduced-motion: reduce`.
- New `.glass` utility class (in a shared stylesheet, applied via
  CSS modules using `composes`): `backdrop-filter: blur(20px) saturate(180%)`,
  theme-aware translucent surface, inset top border-highlight, soft outer
  shadow. Applied to: hero panel, feature list, dashboard header, schedule
  cards.
- Dark-mode variants added to `page.module.css` and `dashboard.module.css`
  via `@media (prefers-color-scheme: dark)`.

## Motion

- `lib/ui/useScrollReveal.ts`: small vanilla IntersectionObserver hook, no
  new dependencies. Adds a `.revealed` class that CSS transitions
  (`opacity`, `translateY`) off of. Applied to hero, feature list items
  (staggered), dashboard cards (staggered).
- Hover/press micro-motion (scale, shadow) via CSS transitions only.
- All motion wrapped in `@media (prefers-reduced-motion: reduce)` to
  disable non-essential animation for users who ask for it.

## Copy

- Landing hero: tighten existing wording, same structure.
- New "Built for shift work" section naming the job-role categories the
  product actually serves — firefighter, medical, law enforcement,
  industrial, transportation, hospitality — sourced from the real
  `JobRole` enum (`supabase/migrations/0001_init.sql`, `ARCHITECTURE.md`),
  not generic scheduling-app copy.
- Dashboard subtitle: light tone pass only, no structural change (already
  correctly labeled as placeholder data by unit-09).

## Non-goals

- No new npm dependencies (rules out Framer Motion et al.).
- No layout/routing changes, no new pages.
- No change to placeholder-data behavior in the dashboard.

## Files touched

`app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/page.module.css`,
`app/dashboard/page.tsx`, `app/dashboard/dashboard.module.css`, new
`lib/ui/useScrollReveal.ts`.

## Verification

`npm run lint && npm run build` must pass clean (matches CI workflow).
Manually reviewed in a browser for both light and dark color schemes, and
with `prefers-reduced-motion` toggled, before calling this done.
