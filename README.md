# FloodGate UI

High-frequency instrumentation analysis platform — React frontend prototype.

## Stack

- **Vite 8** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (dark instrumentation theme)
- **uPlot 1.6** — canvas-based time-series renderer (handles 400 kHz–1 MHz data)
- **react-grid-layout 2.x** — draggable, resizable widget dashboard
- **Zustand 5** — workspace + auth state
- **React Router 7** — client-side routing

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

## Pages

| Route | Description |
|---|---|
| `/` | Landing — test campaign cards |
| `/test/:testId` | Event table — multi-select, open in workspace |
| `/workspace/:testId` | Analysis workspace — channel panel + widget dashboard |

## Workspace features

- **Channel panel** — per-event channel tree, visibility toggles, sensor-type badges
- **Waveform widget** — uPlot plot with zoom/pan, marker placement, cursor time readout, Δt between markers
- **Stats widget** — min/max/mean/RMS/std-dev/peak/rise-time/fall-time table
- **Comparative widget** — overlay channels from multiple events on a shared time axis
- **Dashboard** — drag-to-reorder, resize handles, pop-out to window

## Mock data

Four test campaigns with deterministic waveform generation:
- `TEST-2024-001` — Structural Fatigue (12 events, 6 channels)
- `TEST-2024-002` — Pressure Vessel Burst (8 events, 7 channels)
- `TEST-2025-001` — Composite Impact (24 events, 8 channels)
- `TEST-2025-002` — Weld Integrity (6 events, 4 channels)

Waveform profiles: impulse, sine burst, ramp-hold, AE burst, step decay.

## Auth (mock)

Uses a stub Keycloak OIDC store with three users (admin/analyst/viewer). Switch via the **DEV** button in the top-right during prototyping. Real Keycloak integration is a future milestone.
