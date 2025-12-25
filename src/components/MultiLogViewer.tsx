import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { Project } from "../types/project";
import { LogViewer } from "./LogViewer";
import { X, Columns, LayoutList, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";

interface MultiLogViewerProps {
  projects: Project[];
  activeProjectPath: string | null;
  onSelectProject: (path: string) => void;
  onCloseProject: (path: string) => void;
}

type ViewMode = "tabs" | "split";

export function MultiLogViewer({
  projects,
  activeProjectPath,
  onSelectProject,
  onCloseProject,
}: MultiLogViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("tabs");

  // Filter to only show running or recently active projects
  const openProjects = projects.filter(
    (p) => p.status === "running" || p.status === "starting" || p.logs.length > 0
  );

  if (openProjects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Start a project to view logs</p>
      </div>
    );
  }

  const activeProject = openProjects.find((p) => p.path === activeProjectPath) || openProjects[0];

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar with view mode toggle */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-1">
        <div className="flex items-center overflow-x-auto">
          {openProjects.map((project) => (
            <TabButton
              key={project.path}
              project={project}
              isActive={viewMode === "tabs" && project.path === activeProject?.path}
              onClick={() => onSelectProject(project.path)}
              onClose={() => onCloseProject(project.path)}
              showClose={viewMode === "tabs"}
            />
          ))}
        </div>

        {/* View mode toggle */}
        {openProjects.length > 1 && (
          <div className="flex items-center gap-1 px-2 shrink-0">
            <Button
              variant={viewMode === "tabs" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setViewMode("tabs")}
              title="Tab view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={viewMode === "split" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setViewMode("split")}
              title="Split view"
            >
              <Columns className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Log content */}
      {viewMode === "tabs" ? (
        <div className="flex-1 overflow-hidden">
          {activeProject && <LogViewer project={activeProject} showHeader={false} />}
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {openProjects.map((project, index) => (
            <div
              key={project.path}
              className={`flex-1 overflow-hidden ${
                index > 0 ? "border-l border-border" : ""
              }`}
            >
              <LogViewer project={project} showHeader={true} compact={true} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  project,
  isActive,
  onClick,
  onClose,
  showClose,
}: {
  project: Project;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  showClose: boolean;
}) {
  const statusColors = {
    running: "bg-green-500",
    starting: "bg-yellow-500 animate-pulse",
    stopped: "bg-zinc-600",
    error: "bg-red-500",
  };

  const handleOpenInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = project.detectedUrl || (project.port ? `http://localhost:${project.port}` : null);
    if (url) {
      open(url);
    }
  };

  const hasUrl = project.detectedUrl || project.port;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors ${
        isActive
          ? "text-foreground border-primary bg-background"
          : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50"
      }`}
      onClick={onClick}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          statusColors[project.status as keyof typeof statusColors] || statusColors.stopped
        }`}
      />
      <span className="truncate max-w-[120px]">{project.name}</span>
      {project.port && (
        <span className="text-[10px] text-muted-foreground">:{project.port}</span>
      )}
      {hasUrl && project.status === "running" && (
        <button
          className="opacity-0 group-hover:opacity-100 hover:text-primary p-0.5"
          onClick={handleOpenInBrowser}
          title="Open in browser"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      )}
      {showClose && (
        <button
          className="opacity-0 group-hover:opacity-100 hover:text-foreground p-0.5 -mr-1"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
