import { useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { Project, LogEntry } from "../types/project";
import { useAppStore } from "../stores/app-store";
import { Button } from "./ui/button";
import { X, Trash2 } from "lucide-react";

// Regex to match URLs in log messages
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

interface LogViewerProps {
  project: Project;
  showHeader?: boolean;
  compact?: boolean;
}

export function LogViewer({ project, showHeader = true, compact = false }: LogViewerProps) {
  const { selectProject } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [project.logs.length]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - optional */}
      {showHeader && (
        <div className={`flex items-center justify-between px-3 ${compact ? 'py-1' : 'py-2'} border-b border-border bg-muted/30`}>
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>
              {compact ? project.name : `Logs: ${project.name}`}
            </span>
            <StatusBadge status={project.status} compact={compact} />
            {project.port && compact && (
              <span className="text-[10px] text-muted-foreground">:{project.port}</span>
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => selectProject(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Log Content */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-auto font-mono text-xs log-scroll ${compact ? 'p-2' : 'p-4'}`}
      >
        {project.logs.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            No logs yet. Start the project to see output.
          </div>
        ) : (
          project.logs.map((entry, i) => <LogLine key={i} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const levelConfig = {
    info: {
      text: "text-sky-300",
      bg: "",
      badge: "text-sky-400"
    },
    warn: {
      text: "text-yellow-300",
      bg: "bg-yellow-500/5",
      badge: "text-yellow-400"
    },
    error: {
      text: "text-red-300",
      bg: "bg-red-500/10",
      badge: "text-red-400"
    },
    debug: {
      text: "text-zinc-500",
      bg: "",
      badge: "text-zinc-500"
    },
  };

  const config = levelConfig[entry.level];

  const timestamp = entry.timestamp.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Parse message and make URLs clickable
  const renderMessage = (message: string) => {
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    // Reset regex state
    URL_REGEX.lastIndex = 0;

    while ((match = URL_REGEX.exec(message)) !== null) {
      // Add text before the URL
      if (match.index > lastIndex) {
        parts.push(message.slice(lastIndex, match.index));
      }

      // Add clickable URL
      const url = match[0];
      parts.push(
        <button
          key={match.index}
          onClick={(e) => {
            e.stopPropagation();
            open(url);
          }}
          className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
        >
          {url}
        </button>
      );

      lastIndex = match.index + url.length;
    }

    // Add remaining text
    if (lastIndex < message.length) {
      parts.push(message.slice(lastIndex));
    }

    return parts.length > 0 ? parts : message;
  };

  return (
    <div className={`flex gap-2 py-0.5 hover:bg-muted/30 ${config.bg}`}>
      <span className="text-zinc-600 shrink-0">{timestamp}</span>
      <span className={config.text}>{renderMessage(entry.message)}</span>
    </div>
  );
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const statusConfig = {
    running: { color: "bg-green-500/20 text-green-400", label: "Running" },
    starting: { color: "bg-yellow-500/20 text-yellow-400", label: "Starting" },
    stopped: { color: "bg-muted text-muted-foreground", label: "Stopped" },
    error: { color: "bg-red-500/20 text-red-400", label: "Error" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;

  if (compact) {
    return null; // In compact mode, status is shown via the dot in the tab
  }

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${config.color}`}>
      {config.label}
    </span>
  );
}
