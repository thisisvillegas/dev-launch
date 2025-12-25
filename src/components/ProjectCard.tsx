import { Project } from "../types/project";
import { useAppStore } from "../stores/app-store";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Play, Square, Package, FileCode2, Cog, Container } from "lucide-react";

interface ProjectCardProps {
  project: Project;
}

const typeIcons: Record<string, React.ReactNode> = {
  node: <Package className="w-5 h-5" />,
  python: <FileCode2 className="w-5 h-5" />,
  go: <Cog className="w-5 h-5" />,
  rust: <Cog className="w-5 h-5" />,
  docker: <Container className="w-5 h-5" />,
};

const typeLabels: Record<string, string> = {
  node: "Node.js",
  python: "Python",
  go: "Go",
  rust: "Rust",
  docker: "Docker",
};

const typeColors: Record<string, string> = {
  node: "text-green-400",
  python: "text-blue-400",
  go: "text-cyan-400",
  rust: "text-orange-400",
  docker: "text-blue-500",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const { startProject, stopProject, selectProject, selectedProject } = useAppStore();

  const isRunning = project.status === "running";
  const isStarting = project.status === "starting";
  const isSelected = selectedProject?.path === project.path;

  return (
    <Card
      className={`cursor-pointer transition-all hover:border-primary/50 overflow-hidden ${
        isSelected ? "border-primary ring-1 ring-primary" : ""
      }`}
      onClick={() => selectProject(project)}
    >
      {/* Card Content */}
      <div className="p-4">
        {/* Header Row: Icon + Name + Status */}
        <div className="flex items-start gap-3 mb-3">
          {/* Project Type Icon */}
          <div className={`shrink-0 ${typeColors[project.type] || "text-muted-foreground"}`}>
            {typeIcons[project.type] || <Package className="w-5 h-5" />}
          </div>

          {/* Name and Type */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate" title={project.name}>
              {project.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {typeLabels[project.type] || "Unknown"}
            </p>
          </div>

          {/* Status Indicator */}
          <StatusIndicator status={project.status} port={project.port} />
        </div>

        {/* Footer Row: Script Badge + Actions */}
        <div className="flex items-center justify-between">
          {/* Script Badge */}
          <div className="min-w-0 flex-1">
            {project.scripts.length > 0 && (
              <Badge variant="secondary" className="text-xs truncate max-w-full">
                {project.selectedScript || project.scripts[0]?.name}
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="shrink-0 ml-2">
            {isRunning ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                onClick={(e) => {
                  e.stopPropagation();
                  stopProject(project.path);
                }}
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                disabled={isStarting}
                onClick={(e) => {
                  e.stopPropagation();
                  startProject(project.path);
                }}
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                {isStarting ? "Starting..." : "Start"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusIndicator({ status, port }: { status: string; port?: number }) {
  const statusConfig = {
    running: { color: "bg-green-500", pulseColor: "bg-green-500", label: port ? `:${port}` : "Running" },
    starting: { color: "bg-yellow-500", pulseColor: "bg-yellow-500 animate-pulse", label: "Starting" },
    stopped: { color: "bg-zinc-600", pulseColor: "", label: "Stopped" },
    error: { color: "bg-red-500", pulseColor: "", label: "Error" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        {config.pulseColor && (
          <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.pulseColor} opacity-75`} />
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{config.label}</span>
    </div>
  );
}
