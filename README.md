# DevLaunch

A Tauri desktop app for managing local development projects - start/stop processes, view logs, monitor ports, and track system resources.

## Features

- **Project Management** - Scan directories for dev projects, start/stop with one click
- **Git Integration** - Real-time git status badges showing branch, commits behind, and one-click pull
- **Log Viewer** - Real-time log streaming from running processes
- **Port Monitor** - See what's running on which ports
- **System Monitor** - CPU, memory, disk, GPU stats with swap warnings
- **Webhook Receiver** - Built-in webhook server with ngrok tunnel support for testing webhooks locally
- **Presets** - Save groups of running projects as presets to launch them together
- **Persistence** - Automatically saves and restores watched directories and presets
- **Menubar/Tray Mode** - Runs in the system tray, toggle window visibility with a click

## Tech Stack

- **Desktop:** Tauri 2 (Rust backend)
- **Frontend:** React 18 + TypeScript + Tailwind CSS
- **State:** Zustand
- **Build:** Vite

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## How It Works

### Project Detection
Add a directory to DevLaunch and it scans for projects with:
- `package.json` (Node.js)
- `requirements.txt` / `pyproject.toml` (Python)
- `go.mod` (Go)
- `Cargo.toml` (Rust)
- `docker-compose.yml` (Docker)

### Tray Behavior
- **Left-click** toggles window visibility
- **Right-click** shows menu (Show/Hide/Quit)
- Closing the window hides to tray (if no processes running)
- Quit prompts to stop running processes

### Persistence
Config is saved to:
- macOS: `~/Library/Application Support/com.devlaunch.app/config.json`
- Linux: `~/.config/com.devlaunch.app/config.json`
- Windows: `%APPDATA%/com.devlaunch.app/config.json`

## Recent Updates (December 22, 2025)

### Git Integration
- **GitStatusBadge Component** - Shows branch name, commits behind count, and sync status
- **One-Click Pull** - Pull latest changes directly from the project card
- **Status Indicators**:
  - Green checkmark: Up to date
  - Orange with number: Commits behind (clickable to pull)
  - Yellow warning: Fetch error (auth required)
  - Red X: Pull failed (e.g., uncommitted changes)
- **Auto-refresh** - Git status checked periodically for active projects

### Webhook Receiver
- **Built-in Webhook Server** - Local HTTP server for receiving webhooks (default port: 3456)
- **ngrok Integration** - One-click tunnel creation for public webhook testing
- **Request Inspector** - View webhook requests with headers, body, query params, and method
- **Event History** - Full log of received webhooks with timestamps
- **JSON Formatting** - Automatic JSON pretty-printing for request bodies

### Additional Improvements
- **Multi-Log Viewer** - View logs from multiple running projects simultaneously
- **Preferences Modal** - Centralized settings for git polling, webhook server, and more
- **Enhanced Project Cards** - Git status badges integrated into project list items

## Docs

- [Architecture](./docs/ARCHITECTURE.md) - Technical overview
- [Contributing](./docs/CONTRIBUTING.md) - Development guide
