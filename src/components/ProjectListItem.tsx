import { Project } from "../types/project";
import { useAppStore } from "../stores/app-store";
import { Button } from "./ui/button";
import { Play, Square, Package, FileCode2, Cog, Container, ExternalLink } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { GitStatusBadge } from "./GitStatusBadge";

interface ProjectListItemProps {
  project: Project;
  onPull?: (path: string) => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  node: <Package className="w-4 h-4" />,
  python: <FileCode2 className="w-4 h-4" />,
  go: <Cog className="w-4 h-4" />,
  rust: <Cog className="w-4 h-4" />,
  docker: <Container className="w-4 h-4" />,
};

const typeColors: Record<string, string> = {
  node: "text-green-400",
  python: "text-blue-400",
  go: "text-cyan-400",
  rust: "text-orange-400",
  docker: "text-blue-500",
};

export function ProjectListItem({ project, onPull }: ProjectListItemProps) {
  const { startProject, stopProject, selectProject, selectedProject } = useAppStore();

  const isRunning = project.status === "running";
  const isStarting = project.status === "starting";
  const isSelected = selectedProject?.path === project.path;

  const handleOpenInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.port) {
      open(`http://localhost:${project.port}`);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer rounded-md transition-colors ${
        isSelected
          ? "bg-primary/10 border-l-2 border-primary"
          : "hover:bg-muted/50 border-l-2 border-transparent"
      }`}
      onClick={() => selectProject(project)}
    >
      {/* Status Dot */}
      <div className="shrink-0">
        <StatusDot status={project.status} />
      </div>

      {/* Project Type Icon */}
      <div className={`shrink-0 ${typeColors[project.type] || "text-muted-foreground"}`}>
        {typeIcons[project.type] || <Package className="w-4 h-4" />}
      </div>

      {/* Project Name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block" title={project.path}>
          {project.name}
        </span>
      </div>

      {/* Git Status Badge */}
      {onPull && (
        <GitStatusBadge
          gitStatus={project.gitStatus}
          onPull={() => onPull(project.path)}
        />
      )}

      {/* Port Badge + Open Button (if running) */}
      {isRunning && project.port && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 gap-1.5 text-xs font-mono text-primary hover:text-primary hover:bg-primary/10"
          onClick={handleOpenInBrowser}
          title="Open in browser"
        >
          <span>:{project.port}</span>
          <ExternalLink className="w-3 h-3" />
        </Button>
      )}

      {/* Action Button */}
      <div className="shrink-0">
        {isRunning ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-400/10"
            onClick={(e) => {
              e.stopPropagation();
              stopProject(project.path);
            }}
          >
            <Square className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10"
            disabled={isStarting}
            onClick={(e) => {
              e.stopPropagation();
              startProject(project.path);
            }}
          >
            <Play className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-green-500",
    starting: "bg-yellow-500 animate-pulse",
    stopped: "bg-zinc-600",
    error: "bg-red-500",
  };

  return (
    <div className={`w-2 h-2 rounded-full ${colors[status] || colors.stopped}`} />
  );
}
