# Decarby Solar Roof Challenge

Phase 1 prototype — a standalone browser rooftop solar-panel puzzle built with React, TypeScript, Vite, and Phaser.

## Quick start

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run unit tests (Vitest) |

## Phase 1 features

- Welcome, How to Play, Gameplay, and Level Complete screens
- Level 1 **Sunny House** — 8×5 rooftop (40 cells) with drag/tap placement, rotation, undo, restart
- Inventory: 8 square groups + 4 doubles (pure 2×2 tiles cannot cover an odd-height roof; doubles fill the last row while keeping max score at 5,500)
- Deterministic scoring and star ratings (max 5,500)
- localStorage progress (scores, stars, sound, tutorial, achievements)
- Service interfaces ready for a future API backend (no Supabase in Phase 1)

## Architecture

- `src/engine` — pure TypeScript puzzle logic (grid, pieces, placement, scoring, undo)
- `src/phaser` — Phaser canvas presentation only
- `src/services` — local progress with versioned storage schema
- `src/types/services.ts` — backend-ready service boundaries
