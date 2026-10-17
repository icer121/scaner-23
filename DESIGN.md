# Design Style Guide

## Aesthetic Direction

**ElliottWave MOEX** is a professional trading terminal for Elliott Wave
analysis of Moscow Exchange stocks. The aesthetic is a premium **glassmorphic
dark trading dashboard**: deep graphite/navy backgrounds, floating frosted-glass
Bento Grid cards, and neon signal colors reserved strictly for trading
semantics (long/short/AI). The tone is technical, high-density, and serious —
closer to a Bloomberg terminal or a high-end crypto trading dashboard than a
consumer app. No playful or decorative elements; every color has meaning.

## Color Palette

- `--color-abyss` `#0b0f19` — primary page background (deep matte graphite)
- `--color-navy` `#111827` — secondary surface background (deep naval blue-black)
- `.glass-card` utility — `bg-slate-900/60` + `backdrop-blur-xl` +
  `border-white/5` + soft shadow — the base treatment for every floating panel
- `--color-long` `#00ffa3` — LONG signals, profits, bullish states (use with a
  soft `drop-shadow`/glow on key numbers)
- `--color-short` `#ff4a5a` — SHORT signals, losses, bearish states
- `--color-ai` `#6366f1` — AI/forecast/analytical accents (indigo)
- `--color-gold` `#ffc53d` — risk/reward, neutral highlight metric
- `--color-fg` `#e2e8f0`, `--color-fg-muted` `#94a3b8`, `--color-fg-faint`
  `#64748b` — text hierarchy (primary / secondary / tertiary)

## Typography

- Display/heading + UI font: **Space Grotesk** (`--font-display`) — technical,
  geometric, slightly futuristic. Used for all headings, labels, nav.
- Numeric/data font: **JetBrains Mono** (`--font-mono`) — used for all prices,
  tickers, percentages, timestamps via the `.font-mono-tabular` utility
  (tabular numerals) so columns of numbers align.
- Avoid Inter/Roboto/Arial entirely.

## Spacing & Radius

- Page gutters: `p-4` on desktop Bento Grid layouts.
- Card radius: `rounded-2xl` (`--radius-card: 1rem` equivalent, via
  `.glass-card` or `rounded-2xl` directly).
- Grid gaps: `gap-4` between Bento cells.
- Mini list items inside panels: `p-3 rounded-xl`.

## Motion & Animation

- `animate-fade-in` — simple opacity fade for route/data transitions.
- `animate-slide-up` — fade + translate-y(12px→0) for card/list entrances.
- `animate-glow-pulse` — slow opacity pulse (2s) for live/online status dots.
- Hover: icon buttons scale slightly (`hover:scale-110`) with color transition
  (`transition duration-200`). Active states get a colored glow shadow
  (e.g. `shadow-md shadow-indigo-500/30`).
