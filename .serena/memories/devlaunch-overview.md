# DevLaunch Project Overview

## What It Is
DevLaunch is a Tauri 2 desktop app for managing local development projects. It lets you start/stop dev servers, view logs, monitor ports, and track system resources.

## Tech Stack
- **Backend:** Tauri 2 (Rust)
- **Frontend:** React 18 + TypeScript + Tailwind CSS
- **State:** Zustand
- **Build:** Vite

## Key Features
1. **Project Detection** - Scans directories for package.json, Cargo.toml, go.mod, etc.
2. **Process Management** - Start/stop dev servers with real-time log streaming
3. **Port Monitor** - Shows what's running on which ports (via lsof)
4. **System Monitor** - CPU, memory, disk, GPU stats
5. **Presets** - Save groups of running projects to launch together
6. **Persistence** - Auto-saves watched dirs and presets to config.json
7. **Tray Mode** - Runs in system tray, left-click toggles window

## Project Structure
```
dev-launch/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # useConfig, useLogStream
│   ├── stores/app-store.ts # Zustand state
│   └── App.tsx             # Main app
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri setup + tray
│   │   ├── process.rs      # spawn/kill processes
│   │   ├── config.rs       # load/save config
│   │   └── system.rs       # system info
│   └── Cargo.toml
└── docs/                   # Documentation
```

## Key Files

### Backend (Rust)
- `lib.rs` - Tauri setup, tray icon, window close handling
- `process.rs` - Process spawning with tokio, log event emission
- `config.rs` - JSON config persistence to app data dir
- `system.rs` - System stats via shell commands

### Frontend (React)
- `app-store.ts` - Zustand store with projects, presets, actions
- `useConfig.ts` - Hook for loading/saving config with debounce
- `useLogStream.ts` - Subscribes to Tauri process-log events
- `scanner.ts` - Detects project types from marker files

## Recent Changes (Dec 2024)
1. **Added persistence** - Config saved to ~/Library/Application Support/com.devlaunch.app/config.json
2. **Added tray mode** - Left-click toggles, right-click shows menu
3. **Close-to-tray** - Window hides instead of quitting (if no processes)
4. **Quit dialog** - Prompts to stop running processes before quit

## Running
```bash
npm install
npm run tauri dev
```

## Building
```bash
npm run tauri build
```

## Config Location
- macOS: `~/Library/Application Support/com.devlaunch.app/config.json`
- Linux: `~/.config/com.devlaunch.app/config.json`
- Windows: `%APPDATA%/com.devlaunch.app/config.json`
