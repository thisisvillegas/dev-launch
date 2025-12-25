export type ProjectType = "node" | "python" | "go" | "rust" | "docker" | "unknown";

export type ProcessStatus = "stopped" | "starting" | "running" | "error";

export interface ProjectScript {
  name: string;
  command: string;
}

export interface GitStatus {
  isGitRepo: boolean;
  branch: string | null;
  remote: string | null;
  behindCount: number;
  lastChecked: Date | null;
  fetchError: string | null;
  isPulling: boolean;
  pullError: string | null;  // Error from last pull attempt
}

export interface Project {
  path: string;
  name: string;
  type: ProjectType;
  scripts: ProjectScript[];
  selectedScript?: string;
  status: ProcessStatus;
  pid?: number;
  port?: number;
  detectedUrl?: string;
  logs: LogEntry[];
  error?: string;
  gitStatus?: GitStatus;
}

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

export interface Preset {
  id: string;
  name: string;
  projects: PresetProject[];
}

export interface PresetProject {
  path: string;
  script: string;
}

export interface WindowState {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
}

export interface GitToken {
  id: string;
  pattern: string;  // e.g., "github.com/routefusion/*", "*" for fallback
  token: string;
  label?: string;   // optional friendly name for display
}

export interface GitPreferences {
  enabled: boolean;
  pollingIntervalMinutes: number;
  tokens: GitToken[];
}

export interface Preferences {
  ngrokAuthToken?: string;
  defaultWebhookPort: number;
  git: GitPreferences;
}

export interface AppConfig {
  watchedDirs: string[];
  presets: Preset[];
  lastSession?: {
    runningProjects: PresetProject[];
  };
  windowState?: WindowState;
  preferences: Preferences;
}
