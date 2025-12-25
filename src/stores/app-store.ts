import { create } from "zustand";
import { Project, Preset, LogEntry, ProcessStatus, GitStatus } from "../types/project";
import { scanDirectoryForProjects } from "../lib/scanner";

// Log cache helpers - persist logs to localStorage
const LOG_CACHE_KEY = "devlaunch-log-cache";
const MAX_CACHED_LOGS = 500; // Per project

function getLogCache(): Record<string, LogEntry[]> {
  try {
    const cached = localStorage.getItem(LOG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Restore Date objects
      for (const path in parsed) {
        parsed[path] = parsed[path].map((log: LogEntry) => ({
          ...log,
          timestamp: new Date(log.timestamp),
        }));
      }
      return parsed;
    }
  } catch (e) {
    console.error("[LogCache] Failed to load:", e);
  }
  return {};
}

function saveLogCache(logs: Record<string, LogEntry[]>) {
  try {
    localStorage.setItem(LOG_CACHE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error("[LogCache] Failed to save:", e);
  }
}

function updateLogCacheForProject(path: string, logs: LogEntry[]) {
  const cache = getLogCache();
  cache[path] = logs.slice(-MAX_CACHED_LOGS);
  saveLogCache(cache);
}

interface AppState {
  // Projects
  projects: Project[];
  selectedProject: Project | null;

  // Directories
  watchedDirs: string[];

  // Presets
  presets: Preset[];

  // Scanning state
  isScanning: boolean;

  // Actions
  scanDirectory: (path: string) => Promise<void>;
  removeDirectory: (path: string) => void;
  rescanAllDirectories: () => Promise<void>;
  selectProject: (project: Project | null) => void;
  startProject: (path: string, script?: string) => Promise<void>;
  stopProject: (path: string) => Promise<void>;
  appendLog: (path: string, entry: LogEntry) => void;
  clearLogs: (path: string) => void;
  updateProjectStatus: (path: string, status: ProcessStatus, pid?: number) => void;
  updateProjectUrl: (path: string, url: string, port: number) => void;
  updateGitStatus: (path: string, status: Partial<GitStatus>) => void;

  // Presets
  createPreset: (name: string) => void;
  deletePreset: (id: string) => void;
  runPreset: (id: string) => Promise<void>;

  // Config persistence
  setWatchedDirs: (dirs: string[]) => void;
  setPresets: (presets: Preset[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  selectedProject: null,
  watchedDirs: [],
  presets: [],
  isScanning: false,

  scanDirectory: async (path: string) => {
    const { watchedDirs, projects } = get();

    if (watchedDirs.includes(path)) return;

    set({ isScanning: true });

    try {
      const newProjects = await scanDirectoryForProjects(path);

      // Restore cached logs for each project
      const logCache = getLogCache();
      const projectsWithLogs = newProjects.map(p => ({
        ...p,
        logs: logCache[p.path] || [],
      }));

      set({
        watchedDirs: [...watchedDirs, path],
        projects: [...projects, ...projectsWithLogs],
        isScanning: false,
      });
    } catch (error) {
      console.error("Failed to scan directory:", error);
      set({ isScanning: false });
    }
  },

  removeDirectory: (path: string) => {
    const { watchedDirs, projects } = get();

    set({
      watchedDirs: watchedDirs.filter((d) => d !== path),
      projects: projects.filter((p) => !p.path.startsWith(path)),
    });
  },

  rescanAllDirectories: async () => {
    const { watchedDirs, projects } = get();

    // Save project state to preserve across rescan (running status + git status + logs)
    const savedProjectState = new Map<string, {
      pid?: number;
      status: ProcessStatus;
      selectedScript?: string;
      gitStatus?: GitStatus;
      logs: LogEntry[];
      detectedUrl?: string;
      port?: number;
    }>();
    for (const p of projects) {
      savedProjectState.set(p.path, {
        pid: p.status === "running" || p.pid ? p.pid : undefined,
        status: p.status === "running" ? p.status : "stopped",
        selectedScript: p.selectedScript,
        gitStatus: p.gitStatus,
        logs: p.logs,
        detectedUrl: p.detectedUrl,
        port: p.port,
      });
    }

    set({ isScanning: true, projects: [] });

    try {
      const allProjects: Project[] = [];

      for (const dir of watchedDirs) {
        const newProjects = await scanDirectoryForProjects(dir);
        allProjects.push(...newProjects);
      }

      // Restore saved state for projects (including logs)
      const logCache = getLogCache();
      const restoredProjects = allProjects.map((p) => {
        const savedState = savedProjectState.get(p.path);
        if (savedState) {
          return {
            ...p,
            pid: savedState.pid,
            status: savedState.status,
            selectedScript: savedState.selectedScript,
            gitStatus: savedState.gitStatus,
            logs: savedState.logs,
            detectedUrl: savedState.detectedUrl,
            port: savedState.port,
          };
        }
        // For new projects not in saved state, try to load from cache
        return {
          ...p,
          logs: logCache[p.path] || [],
        };
      });

      set({
        projects: restoredProjects,
        isScanning: false,
      });
    } catch (error) {
      console.error("Failed to rescan directories:", error);
      set({ isScanning: false });
    }
  },

  selectProject: (project: Project | null) => {
    set({ selectedProject: project });
  },

  startProject: async (path: string, script?: string) => {
    const { projects } = get();
    const project = projects.find((p) => p.path === path);

    if (!project) return;

    const scriptToRun = script || project.selectedScript || project.scripts[0]?.name;

    if (!scriptToRun) return;

    // Helper to update projects and keep selectedProject in sync
    const updateProjects = (updater: (p: Project) => Project) => {
      const currentProjects = get().projects;
      const updatedProjects = currentProjects.map((p) =>
        p.path === path ? updater(p) : p
      );
      // Always select the project being started so logs are visible
      const newSelectedProject = updatedProjects.find(p => p.path === path);
      set({ projects: updatedProjects, selectedProject: newSelectedProject });
    };

    // Update status to starting (this also selects the project)
    updateProjects((p) => ({ ...p, status: "starting" as ProcessStatus, selectedScript: scriptToRun }));

    try {
      // Call Tauri to spawn process
      const { invoke } = await import("@tauri-apps/api/core");
      const pid = await invoke<number>("spawn_process", {
        cwd: path,
        command: getCommand(project.type, scriptToRun),
        args: getArgs(project.type, scriptToRun),
      });

      console.log("[startProject] Process started with pid:", pid);
      updateProjects((p) => ({ ...p, status: "running" as ProcessStatus, pid }));
    } catch (error) {
      updateProjects((p) => ({ ...p, status: "error" as ProcessStatus, error: String(error) }));
    }
  },

  stopProject: async (path: string) => {
    const { projects } = get();
    const project = projects.find((p) => p.path === path);

    console.log("[stopProject] path:", path, "project:", project?.name, "pid:", project?.pid, "status:", project?.status);

    if (!project) {
      console.log("[stopProject] Project not found!");
      return;
    }

    // If we have a pid, try to kill it
    if (project.pid) {
      console.log("[stopProject] Killing pid:", project.pid);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke("kill_process", { pid: project.pid });
        console.log("[stopProject] Kill result:", result);
      } catch (error) {
        console.error("[stopProject] Failed to kill process:", error);
      }
    } else {
      console.log("[stopProject] No pid to kill");
    }

    // Always update the status to stopped and sync selectedProject
    const updatedProjects = get().projects.map((p) =>
      p.path === path
        ? { ...p, status: "stopped" as ProcessStatus, pid: undefined }
        : p
    );
    const currentSelected = get().selectedProject;
    const newSelectedProject = currentSelected?.path === path
      ? updatedProjects.find(p => p.path === path) || currentSelected
      : currentSelected;

    set({
      projects: updatedProjects,
      selectedProject: newSelectedProject,
    });
  },

  appendLog: (path: string, entry: LogEntry) => {
    const { projects, selectedProject } = get();
    const maxLogs = 1000;

    const updatedProjects = projects.map((p) =>
      p.path === path
        ? { ...p, logs: [...p.logs.slice(-maxLogs + 1), entry] }
        : p
    );

    // Keep selectedProject in sync with projects array
    const newSelectedProject = selectedProject?.path === path
      ? updatedProjects.find(p => p.path === path) || selectedProject
      : selectedProject;

    set({
      projects: updatedProjects,
      selectedProject: newSelectedProject,
    });

    // Persist to localStorage cache
    const project = updatedProjects.find(p => p.path === path);
    if (project) {
      updateLogCacheForProject(path, project.logs);
    }
  },

  clearLogs: (path: string) => {
    const { projects, selectedProject } = get();

    const updatedProjects = projects.map((p) =>
      p.path === path ? { ...p, logs: [] } : p
    );

    // Keep selectedProject in sync
    const newSelectedProject = selectedProject?.path === path
      ? updatedProjects.find(p => p.path === path) || selectedProject
      : selectedProject;

    set({
      projects: updatedProjects,
      selectedProject: newSelectedProject,
    });

    // Clear from localStorage cache too
    updateLogCacheForProject(path, []);
  },

  updateProjectStatus: (path: string, status: ProcessStatus, pid?: number) => {
    const { projects, selectedProject } = get();

    const updatedProjects = projects.map((p) =>
      p.path === path ? { ...p, status, pid } : p
    );

    // Keep selectedProject in sync
    const newSelectedProject = selectedProject?.path === path
      ? updatedProjects.find(p => p.path === path) || selectedProject
      : selectedProject;

    set({
      projects: updatedProjects,
      selectedProject: newSelectedProject,
    });
  },

  updateProjectUrl: (path: string, url: string, port: number) => {
    const { projects, selectedProject } = get();

    const updatedProjects = projects.map((p) =>
      p.path === path ? { ...p, detectedUrl: url, port } : p
    );

    // Keep selectedProject in sync
    const newSelectedProject = selectedProject?.path === path
      ? updatedProjects.find(p => p.path === path) || selectedProject
      : selectedProject;

    set({
      projects: updatedProjects,
      selectedProject: newSelectedProject,
    });
  },

  updateGitStatus: (path: string, status: Partial<GitStatus>) => {
    const { projects, selectedProject } = get();

    const updatedProjects = projects.map((p) =>
      p.path === path
        ? { ...p, gitStatus: { ...p.gitStatus, ...status } as GitStatus }
        : p
    );

    // Keep selectedProject in sync
    const newSelectedProject = selectedProject?.path === path
      ? updatedProjects.find(p => p.path === path) || selectedProject
      : selectedProject;

    set({
      projects: updatedProjects,
      selectedProject: newSelectedProject,
    });
  },

  createPreset: (name: string) => {
    const { presets, projects } = get();
    const runningProjects = projects
      .filter((p) => p.status === "running")
      .map((p) => ({ path: p.path, script: p.selectedScript || p.scripts[0]?.name }));

    if (runningProjects.length === 0) return;

    const newPreset: Preset = {
      id: crypto.randomUUID(),
      name,
      projects: runningProjects,
    };

    set({ presets: [...presets, newPreset] });
  },

  deletePreset: (id: string) => {
    const { presets } = get();
    set({ presets: presets.filter((p) => p.id !== id) });
  },

  runPreset: async (id: string) => {
    const { presets, startProject } = get();
    const preset = presets.find((p) => p.id === id);

    if (!preset) return;

    for (const proj of preset.projects) {
      await startProject(proj.path, proj.script);
    }
  },

  // Config persistence setters
  setWatchedDirs: (dirs: string[]) => {
    set({ watchedDirs: dirs });
  },

  setPresets: (presets: Preset[]) => {
    set({ presets });
  },
}));

// Helper functions to get command/args based on project type
function getCommand(type: string, _script: string): string {
  switch (type) {
    case "node":
      return "npm";
    case "python":
      return "python";
    case "go":
      return "go";
    case "rust":
      return "cargo";
    case "docker":
      return "docker";
    default:
      return "npm";
  }
}

function getArgs(type: string, script: string): string[] {
  switch (type) {
    case "node":
      return ["run", script];
    case "python":
      return [script];
    case "go":
      return ["run", "."];
    case "rust":
      return ["run"];
    case "docker":
      return ["compose", "up"];
    default:
      return ["run", script];
  }
}
