# DevLaunch Architecture

**Last Updated:** December 23, 2025

## Overview

DevLaunch is a development environment manager built with Tauri 2, React, and TypeScript. It provides a unified interface for managing development server processes, logs, ports, system resources, git status, and webhook testing.

## Technology Stack

### Frontend
- **React 18** - UI component library
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **Lucide React** - Icon library

### Backend
- **Tauri 2** - Desktop application framework (Rust)
- **Tokio** - Async runtime for Rust
- **Serde** - Serialization/deserialization

### Build Tools
- **Vite** - Frontend build tool
- **Tauri CLI** - App bundling and packaging

## Project Structure

```
dev-launch/
├── src/                        # React frontend
│   ├── components/             # UI components
│   │   ├── DirectoryPicker.tsx # Directory selection
│   │   ├── GitStatusBadge.tsx  # Git status display with one-click pull
│   │   ├── LogViewer.tsx       # Log display with ANSI support
│   │   ├── MultiLogViewer.tsx  # Multi-project log viewer
│   │   ├── PortMonitor.tsx     # Port scanning display
│   │   ├── PreferencesModal.tsx # Settings and configuration
│   │   ├── PresetBar.tsx       # Preset management
│   │   ├── ProjectListItem.tsx # Project card with controls and git status
│   │   ├── QuitDialog.tsx      # Quit confirmation
│   │   ├── SystemMonitor.tsx   # Full system stats
│   │   ├── SystemStats.tsx     # Header stats badge
│   │   └── WebhookReceiver.tsx # Webhook server and ngrok integration
│   ├── hooks/
│   │   ├── useConfig.ts        # Config persistence hook
│   │   └── useLogStream.ts     # Tauri event subscription
│   ├── lib/
│   │   └── scanner.ts          # Project detection logic
│   ├── stores/
│   │   └── app-store.ts        # Zustand global state
│   ├── types/
│   │   └── project.ts          # TypeScript interfaces
│   ├── App.tsx                 # Main application
│   └── main.tsx                # React entry point
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── config.rs           # Config load/save commands
│   │   ├── git.rs              # Git status, fetch, and pull operations
│   │   ├── process.rs          # Process spawn/kill/status
│   │   ├── system.rs           # System info gathering
│   │   └── lib.rs              # Tauri setup + tray icon
│   ├── icons/                  # App icons
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── docs/                       # Documentation
└── package.json                # Node dependencies
```

## Core Modules

### 1. Rust Backend (`src-tauri/`)

#### `lib.rs` - Application Setup
- Tauri plugin initialization (shell, dialog, fs)
- Tray icon with menu (Show/Hide/Quit)
- Window close handling (hide to tray vs quit dialog)
- Command handler registration

#### `process.rs` - Process Management
- `spawn_process` - Launch dev server with log streaming
- `kill_process` - Terminate by PID
- `kill_all_processes` - Cleanup on quit
- `get_process_status` - Check if running
- `scan_ports` - Find listening ports (via `lsof`)

#### `config.rs` - Persistence
- `load_config` - Read from app data directory
- `save_config` - Write JSON config
- `get_config_path_string` - Return config file path

#### `system.rs` - System Monitoring
- `get_system_info` - CPU, memory, disk, GPU stats
- `get_top_processes` - CPU/memory hogs

#### `git.rs` - Git Operations
- `get_git_status` - Get branch, remote, ahead/behind counts
- `git_fetch` - Fetch from remote to check for updates
- `git_pull` - Pull latest changes from remote
- Returns detailed status including fetch/pull errors

### 2. React Frontend (`src/`)

#### State Management (`stores/app-store.ts`)
Zustand store with:
- `projects` - Detected projects with status
- `watchedDirs` - Scanned directories
- `presets` - Saved project groups
- `selectedProject` - Currently viewing
- Actions: `startProject`, `stopProject`, `appendLog`, etc.

#### Config Hook (`hooks/useConfig.ts`)
- Loads config on mount
- Debounced auto-save (1 second delay)
- Restores watched directories and presets

#### Log Streaming (`hooks/useLogStream.ts`)
- Subscribes to `process-log` Tauri events
- Routes logs to correct project in store
- Handles stdout/stderr differentiation

#### New Components (December 2025)

**GitStatusBadge** (`components/GitStatusBadge.tsx`)
- Displays git branch name and sync status
- Shows commits behind count with visual indicator
- One-click pull functionality
- Status indicators:
  - ✓ Green check: Up to date
  - ⬇ Orange with number: Behind remote (clickable)
  - ⚠ Yellow warning: Fetch error (auth required)
  - ✗ Red X: Pull failed (uncommitted changes, etc.)
- Hover tooltip with detailed git info

**WebhookReceiver** (`components/WebhookReceiver.tsx`)
- Built-in HTTP webhook server (configurable port)
- ngrok tunnel integration for public access
- Request history with full details (method, headers, body, query)
- JSON body formatting
- Copy URL functionality
- Event filtering and management

**MultiLogViewer** (`components/MultiLogViewer.tsx`)
- View logs from multiple projects simultaneously
- Tab-based interface for switching between projects
- Synchronized log updates via Tauri events

**PreferencesModal** (`components/PreferencesModal.tsx`)
- Centralized settings management
- Git polling interval configuration
- Webhook server settings
- Theme preferences

### 3. Project Detection (`lib/scanner.ts`)

Scans directories for project markers:
| File | Type |
|------|------|
| `package.json` | Node.js |
| `requirements.txt` | Python |
| `pyproject.toml` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `docker-compose.yml` | Docker |

Extracts available scripts from `package.json` for Node projects.

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │ App.tsx  │───│ Zustand  │───│Components│───│  Hooks   │     │
│  └──────────┘   │  Store   │   └──────────┘   └──────────┘     │
│                 └────┬─────┘                        │           │
│                      │invoke()              listen()│           │
└──────────────────────┼──────────────────────────────┼───────────┘
                       │                              │
                 ┌─────▼──────────────────────────────▼─────┐
                 │              Tauri IPC                    │
                 └─────────────────┬────────────────────────┘
                                   │
┌──────────────────────────────────┼────────────────────────────────┐
│                          Rust Backend                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  │ lib.rs   │───│process.rs│───│config.rs │───│system.rs │       │
│  │(tray/win)│   │(spawn/   │   │(load/    │   │(cpu/mem/ │       │
│  │          │   │ kill)    │   │ save)    │   │ disk)    │       │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘       │
│                      │                                            │
│                 ┌────▼────┐                                       │
│                 │  Tokio  │ (async process I/O)                   │
│                 └─────────┘                                       │
└───────────────────────────────────────────────────────────────────┘
```

## IPC Communication

### Commands (Frontend → Backend)
| Command | Description |
|---------|-------------|
| `spawn_process` | Start dev server |
| `kill_process` | Stop by PID |
| `kill_all_processes` | Stop all |
| `get_running_count` | Count active |
| `get_process_status` | Check if running |
| `scan_ports` | List listening ports |
| `get_system_info` | CPU/mem/disk stats |
| `get_top_processes` | Resource hogs |
| `load_config` | Read saved config |
| `save_config` | Write config |
| `get_git_status` | Get git branch/status |
| `git_fetch` | Fetch from remote |
| `git_pull` | Pull latest changes |
| `get_ngrok_status` | Check ngrok tunnel |

### Events (Backend → Frontend)
| Event | Data |
|-------|------|
| `process-log` | `{ path, content, stream }` |

## Persistence

Config file location (platform-specific app data):
```json
{
  "watchedDirs": ["/Users/dev/projects"],
  "presets": [
    {
      "id": "uuid",
      "name": "Backend Stack",
      "projects": [
        { "path": "/path/to/api", "script": "dev" }
      ]
    }
  ]
}
```

## Tray Behavior

- **Left-click**: Toggle window visibility
- **Right-click**: Context menu
  - Show Window
  - Hide Window
  - ─────────────
  - Quit DevLaunch

Close button behavior:
- If processes running → Show quit dialog
- If no processes → Hide to tray

## Build Process

### Development
```bash
npm run tauri dev
```
- Vite dev server (hot reload)
- Rust recompilation on change
- Opens app window

### Production
```bash
npm run tauri build
```
- Compiles Rust → native binary
- Bundles React → optimized JS
- Creates `.app` / `.exe` / `.AppImage`

## Dependencies

### Rust (Cargo.toml)
```toml
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
lazy_static = "1.4"
```

### Node (package.json)
```json
{
  "@tauri-apps/api": "^2",
  "@tauri-apps/cli": "^2",
  "react": "^18",
  "zustand": "^5",
  "tailwindcss": "^3",
  "lucide-react": "^0.400"
}
```
