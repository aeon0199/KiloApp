# KiloApp

KiloApp is a desktop app (Tauri + React) for running and monitoring Kilo CLI sessions across local workspaces.

## Current MVP

- Starts/stops a managed `kilo serve` process
- Health checks against the running Kilo server
- Workspace list (persisted locally)
- Session list/create per workspace
- Chat-style prompt composer (`POST /session/:id/message`)
- Message feed with lightweight tool/reasoning rendering
- Abort button for in-flight runs

## Requirements

- macOS/Linux/Windows with Node.js 18+
- Rust toolchain
- Kilo CLI installed and available in `PATH` as `kilo`

## Run

```bash
npm install
npm run tauri dev
```

## Notes

- Server API calls pass workspace context via `x-opencode-directory`.
- The app can talk to any Kilo server URL, but the `Start`/`Stop` buttons manage a local `kilo serve` child process.
