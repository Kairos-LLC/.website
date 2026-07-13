# Editorial redesign: OG theme, Hermes-style confidence, iOS-first copy

Supersedes `2026-07-12-liquid-glass-ui-design.md` (that direction — dark
gradient blobs + glassmorphism — was rejected for abandoning the original
theme).

## Direction

- **Base**: the original unit-09 theme — white background, SF system font,
  single purple accent `#6d5efc`, minimal.
- **Reference**: https://hermes-agent.nousresearch.com/ — one brand color
  used with total commitment, giant editorial serif display headlines,
  small tracked-uppercase mono labels, numbered feature sections, sparse
  nav, platform CTAs. Kairos difference: the product is an iPhone app, so
  the CTA is App Store-framed (honestly — "coming soon", no fake links).
- **Apple elements, restrained**: SF system stack for body, SF Mono for
  labels, pill buttons, 12px-radius cards, small settle-in scroll reveals
  with Apple easing. No glassmorphism.

## Tokens

| Token | Light | Dark |
|---|---|---|
| `--paper` | `#ffffff` | `#131118` |
| `--ink` | `#16141f` | `#f2f0f7` |
| `--muted` | `#6b6879` | `#9b97ab` |
| `--accent` | `#6d5efc` | `#8477fd` |
| `--hairline` | `#e8e6f0` | `#29263a` |

Display face: Instrument Serif (via `next/font/google`, self-hosted at
build, zero runtime deps), uppercase, tight leading, italic accents.
Label face: system mono (`--font-mono`), 0.72rem, 0.18em tracking,
uppercase, purple — the `.kicker` utility.

## Signature

The full-bleed purple mission band: white Instrument Serif display line on
flat `#6d5efc`. One place where the brand color is used at full commitment;
everything around it stays quiet white/ink.

Numbered features (`#01 PRIVATE / #02 SHIFT-NATIVE / #03 SHAREABLE`) mirror
the product's actual flow — build a private schedule, model the rotation,
share by code — so the numbering encodes real sequence, not decoration.

## Copy

iOS-first framing throughout: hero says "coming to iPhone", nav label
"Coming soon to iPhone", footer "An iPhone app. This site is its front
door." Feature copy grounded in real product concepts (recovery key,
cycles/overrides/on-call from the schema, 6-character single-use access
codes). No invented URLs or fake App Store links.

## Verification

`npm run lint && npm run build` clean; visual review of `/` and
`/dashboard` in browser (light + dark), reduced-motion respected; fresh
Vercel preview deployed and link verified.
