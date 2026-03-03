# KiloApp

> **Work in Progress** — This project is under active development. Features may be incomplete or change without notice.

KiloApp is a desktop client for [KiloCode](https://kilo.ai) — an AI coding agent. Built with Electron and React.

## Features

- Manages a local `kilo serve` process (auto-start, restart, health checks)
- Real-time updates via SSE (Server-Sent Events)
- Workspace management with persistent local storage
- Session list, create, rename, fork, compact, and delete
- Chat-style prompt composer with abort support
- Message feed with tool activity, reasoning, and diff rendering
- Cloud session import
- Agent management
- Model selection across connected providers
- macOS-native window with vibrancy, hidden titlebar, and rounded corners

## Requirements

- macOS (primary), Linux, or Windows
- Node.js 18+
- [Kilo CLI](https://kilo.ai) installed and available in `PATH` as `kilo`

## Development

```bash
npm install
npm run dev
```

This starts Vite on `localhost:5173` and launches the Electron window pointing at it.

## Build

```bash
npm run build      # compile Electron + Vite
npm run dist       # package with electron-builder
```

Built artifacts go to `release/`.

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e-smoke
npm run verify     # runs all gates + build
```

## Diagnostics

- Settings -> Server -> `Open Diagnostics` to collect a snapshot.
- Settings -> Server -> `Export Diagnostics` to produce a support zip bundle.
- Settings -> Server -> `Report Issue` opens a prefilled issue with diagnostics metadata.

## Release

- CI workflow: `.github/workflows/ci.yml`
- macOS beta release workflow: `.github/workflows/release-macos.yml`
- Notarization hook: `scripts/notarize.cjs`
- Release templates:
  - `docs/release-notes-template.md`
  - `docs/known-issues-template.md`
  - `docs/beta-ops.md`

## Architecture

```
electron/
  main.cts          # Electron main process — BrowserWindow, IPC handlers
  preload.cts       # contextBridge exposing window.electron API
src/
  main.tsx          # React entry point
  App.tsx           # Root component — boot, server management, routing
  api.ts            # HTTP client for Kilo server REST API
  hooks.ts          # SSE connection hook
  types.ts          # Shared TypeScript types
  ...               # UI components (Sidebar, ThreadView, Composer, etc.)
build/icons/        # App icons for electron-builder
```

## Notes

- Server API calls pass workspace context via `x-opencode-directory` header.
- The app manages a local `kilo serve` child process but can talk to any running Kilo server on port 4100.
- Window dragging uses CSS `-webkit-app-region: drag` (native Electron support).
