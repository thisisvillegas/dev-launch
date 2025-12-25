import { useEffect, useState, useCallback, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "./stores/app-store";
import { useLogStream } from "./hooks/useLogStream";
import { useUrlStream } from "./hooks/useUrlStream";
import { useConfig } from "./hooks/useConfig";
import { useGitStatus } from "./hooks/useGitStatus";
import { ProjectListItem } from "./components/ProjectListItem";
import { MultiLogViewer } from "./components/MultiLogViewer";
import { PortMonitor } from "./components/PortMonitor";
import { NetworkTab } from "./components/NetworkTab";
import { SystemMonitor } from "./components/SystemMonitor";
import { PresetBar } from "./components/PresetBar";
import { QuitDialog } from "./components/QuitDialog";
import { PreferencesModal } from "./components/PreferencesModal";
import { SystemStats } from "./components/SystemStats";
import { FolderOpen, ScrollText, Radio, Webhook, Activity, ChevronDown, RefreshCw, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

type TabType = "logs" | "ports" | "network" | "system";

function App() {
  const { projects, selectedProject, selectProject, scanDirectory, removeDirectory, watchedDirs, isScanning, rescanAllDirectories, clearLogs } = useAppStore();
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("logs");
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [runningCount, setRunningCount] = useState(0);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [collapsedSubdirs, setCollapsedSubdirs] = useState<Set<string>>(new Set());

  const toggleSubdir = (key: string) => {
    setCollapsedSubdirs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const collapseAllSubdirs = () => {
    const allKeys = projectsByDirectory.flatMap(({ watchedDir, subdirs }) =>
      subdirs.map(({ subdir }) => `${watchedDir}/${subdir}`)
    );
    setCollapsedSubdirs(new Set(allKeys));
  };

  const expandAllSubdirs = () => {
    setCollapsedSubdirs(new Set());
  };

  // Subscribe to log events from Tauri
  useLogStream();

  // Subscribe to URL detection events from Tauri
  useUrlStream();

  // Load and save config (persistence)
  const { preferences, setPreferences } = useConfig();

  // Git status polling
  const { pullProject } = useGitStatus({
    enabled: preferences.git?.enabled ?? true,
    pollingIntervalMinutes: preferences.git?.pollingIntervalMinutes ?? 10,
    tokens: preferences.git?.tokens ?? [],
  });

  // Group projects by watched directory, then by subdirectory
  const projectsByDirectory = useMemo(() => {
    // Structure: { "dres/dev": { "subdir1": [projects], "subdir2": [projects] } }
    const grouped: Record<string, Record<string, typeof projects>> = {};

    for (const project of projects) {
      // Find which watched dir this project belongs to
      const parentDir = watchedDirs.find(dir => project.path.startsWith(dir));
      if (parentDir) {
        // Get the last two segments of the watched dir path (e.g., "dres/dev")
        const watchedParts = parentDir.split('/').filter(Boolean);
        const watchedDirName = watchedParts.length >= 2
          ? `${watchedParts[watchedParts.length - 2]}/${watchedParts[watchedParts.length - 1]}`
          : watchedParts[watchedParts.length - 1] || parentDir;

        // Get the subdirectory name (immediate child of watched dir)
        const relativePath = project.path.slice(parentDir.length).replace(/^\//, '');
        const subdir = relativePath.split('/')[0] || project.name;

        if (!grouped[watchedDirName]) {
          grouped[watchedDirName] = {};
        }
        if (!grouped[watchedDirName][subdir]) {
          grouped[watchedDirName][subdir] = [];
        }
        grouped[watchedDirName][subdir].push(project);
      }
    }

    // Convert to sorted array structure
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([watchedDir, subdirs]) => ({
        watchedDir,
        subdirs: Object.entries(subdirs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([subdir, projects]) => ({ subdir, projects }))
      }));
  }, [projects, watchedDirs]);

  // Listen for preferences menu event
  useEffect(() => {
    const unlisten = listen("open-preferences", () => {
      setShowPreferences(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    // Dark mode by default
    document.documentElement.classList.add("dark");
  }, []);

  // Handle window close event
  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onCloseRequested(async (event) => {
      // Check how many processes are running
      try {
        const count = await invoke<number>("get_running_count");
        if (count > 0) {
          // Prevent default close and show dialog
          event.preventDefault();
          setRunningCount(count);
          setShowQuitDialog(true);
        }
        // If no processes running, let the window close normally
      } catch {
        // If we can't check, just close
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleStopAllAndQuit = async () => {
    try {
      await invoke("kill_all_processes");
    } catch (err) {
      console.error("Failed to kill processes:", err);
    }
    getCurrentWindow().close();
  };

  const handleKeepRunningAndQuit = () => {
    getCurrentWindow().destroy();
  };

  const handleCancelQuit = () => {
    setShowQuitDialog(false);
  };

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Constrain between 200px and 400px
      setSidebarWidth(Math.min(400, Math.max(200, e.clientX)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="h-screen flex flex-col bg-background select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">DL</span>
          </div>
          <h1 className="text-lg font-semibold">DevLaunch</h1>
        </div>
        <SystemStats />
      </header>

      {/* Preset Bar */}
      <PresetBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Project List Sidebar */}
        {projectsCollapsed ? (
          <button
            onClick={() => setProjectsCollapsed(false)}
            className="w-10 border-r border-border bg-muted/30 shrink-0 flex items-center justify-center hover:bg-muted/50 transition-colors"
            title="Expand projects"
          >
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          </button>
        ) : (
          <>
            <div
              style={{ width: sidebarWidth }}
              className="border-r border-border flex flex-col bg-muted/30 shrink-0"
            >
              <button
                onClick={() => setProjectsCollapsed(true)}
                className="flex items-center justify-between w-full p-2 border-b border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                    Projects ({projects.length})
                  </h2>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-0.5">
                  {projects.length > 0 && !isScanning && (
                    <>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          collapseAllSubdirs();
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Collapse all"
                      >
                        <ChevronsDownUp className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          expandAllSubdirs();
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Expand all"
                      >
                        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </>
                  )}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      rescanAllDirectories();
                    }}
                    className={`p-1 rounded hover:bg-muted transition-colors ${isScanning || watchedDirs.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Refresh projects"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isScanning ? 'animate-spin' : ''}`} />
                  </div>
                </div>
              </button>
              <div className="flex-1 overflow-auto p-2">
                {isScanning ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                    <RefreshCw className="w-8 h-8 mb-3 animate-spin opacity-50" />
                    <p className="text-sm text-center">Scanning directories...</p>
                  </div>
                ) : watchedDirs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                    <FolderOpen className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-sm text-center">No directories added</p>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
                    <p className="text-sm text-center">No projects found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectsByDirectory.map(({ watchedDir, subdirs }) => (
                      <div key={watchedDir}>
                        {/* Watched directory header */}
                        <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <FolderOpen className="w-3 h-3" />
                          {watchedDir}
                          <span className="text-muted-foreground/50">
                            ({subdirs.reduce((acc, s) => acc + s.projects.length, 0)})
                          </span>
                        </div>
                        {/* Subdirectories */}
                        <div className="space-y-1 ml-2">
                          {subdirs.map(({ subdir, projects: subProjects }) => {
                            const subdirKey = `${watchedDir}/${subdir}`;
                            const isCollapsed = collapsedSubdirs.has(subdirKey);
                            const hasRunning = subProjects.some(p => p.status === "running");
                            return (
                              <div key={subdir}>
                                {/* Subdirectory header - clickable */}
                                <button
                                  onClick={() => toggleSubdir(subdirKey)}
                                  className={`w-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1 hover:bg-muted/50 rounded transition-all text-left ${
                                    hasRunning
                                      ? "text-green-400/90 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                                      : "text-muted-foreground/70"
                                  }`}
                                >
                                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                  {subdir}
                                  <span className="text-muted-foreground/40">({subProjects.length})</span>
                                </button>
                                {/* Projects in subdirectory */}
                                {!isCollapsed && (
                                  <div className="space-y-0.5 ml-4">
                                    {subProjects.map((project) => (
                                      <ProjectListItem
                                        key={project.path}
                                        project={project}
                                        onPull={(path) => pullProject(path)}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Resize Handle */}
            <div
              className={`w-1 cursor-col-resize hover:bg-primary/50 transition-colors relative group shrink-0 ${
                isResizing ? "bg-primary" : "bg-border"
              }`}
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/20" />
            </div>
          </>
        )}

        {/* Main Panel with Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center border-b border-border bg-muted/30">
            <TabButton
              active={activeTab === "logs"}
              onClick={() => setActiveTab("logs")}
              icon={<ScrollText className="w-4 h-4" />}
              label="Logs"
            />
            <TabButton
              active={activeTab === "ports"}
              onClick={() => setActiveTab("ports")}
              icon={<Radio className="w-4 h-4" />}
              label="Ports"
            />
            <TabButton
              active={activeTab === "network"}
              onClick={() => setActiveTab("network")}
              icon={<Webhook className="w-4 h-4" />}
              label="Network"
            />
            <TabButton
              active={activeTab === "system"}
              onClick={() => setActiveTab("system")}
              icon={<Activity className="w-4 h-4" />}
              label="System"
            />
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "logs" ? (
              <MultiLogViewer
                projects={projects}
                activeProjectPath={selectedProject?.path || null}
                onSelectProject={(path) => {
                  const project = projects.find(p => p.path === path);
                  if (project) selectProject(project);
                }}
                onCloseProject={(path) => {
                  // Clear logs to close the tab
                  clearLogs(path);
                  // If this was the selected project, deselect it
                  if (selectedProject?.path === path) {
                    selectProject(null);
                  }
                }}
              />
            ) : activeTab === "ports" ? (
              <PortMonitor />
            ) : activeTab === "network" ? (
              <NetworkTab />
            ) : (
              <SystemMonitor />
            )}
          </div>
        </div>
      </div>

      {/* Resize overlay to prevent selection issues while dragging */}
      {isResizing && (
        <div className="fixed inset-0 cursor-col-resize z-50" />
      )}

      {/* Quit confirmation dialog */}
      <QuitDialog
        open={showQuitDialog}
        runningCount={runningCount}
        onStopAll={handleStopAllAndQuit}
        onKeepRunning={handleKeepRunningAndQuit}
        onCancel={handleCancelQuit}
      />

      {/* Preferences modal */}
      <PreferencesModal
        open={showPreferences}
        onClose={() => setShowPreferences(false)}
        preferences={preferences}
        onSave={setPreferences}
        watchedDirs={watchedDirs}
        onAddDirectory={scanDirectory}
        onRemoveDirectory={removeDirectory}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active
          ? "text-primary border-primary"
          : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export default App;
