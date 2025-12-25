import { GitStatus } from "../types/project";
import { ArrowDown, Loader2, AlertTriangle, Check, XCircle } from "lucide-react";
import { Button } from "./ui/button";

interface GitStatusBadgeProps {
  gitStatus?: GitStatus;
  onPull: () => void;
}

function formatLastChecked(date: Date | null): string {
  if (!date) return "Never checked";
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function GitStatusBadge({ gitStatus, onPull }: GitStatusBadgeProps) {
  // Don't show anything if not a git repo or no status yet
  if (!gitStatus?.isGitRepo) {
    return null;
  }

  // Build tooltip with full git info
  const buildTooltip = () => {
    const lines: string[] = [];
    if (gitStatus.branch) {
      lines.push(`Branch: ${gitStatus.branch}`);
    }
    if (gitStatus.remote) {
      lines.push(`Remote: ${gitStatus.remote}`);
    }
    if (gitStatus.behindCount > 0) {
      lines.push(`Status: ${gitStatus.behindCount} commit${gitStatus.behindCount > 1 ? "s" : ""} behind`);
    } else if (!gitStatus.fetchError) {
      lines.push("Status: Up to date ✓");
    }
    if (gitStatus.fetchError) {
      lines.push(`Error: ${gitStatus.fetchError}`);
    }
    lines.push(`Checked: ${formatLastChecked(gitStatus.lastChecked)}`);
    return lines.join("\n");
  };

  // Show spinner while pulling
  if (gitStatus.isPulling) {
    return (
      <div className="shrink-0 flex items-center" title="Pulling...">
        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
      </div>
    );
  }

  // Show pull error (e.g., uncommitted changes)
  if (gitStatus.pullError) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1.5 gap-0.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
        onClick={(e) => {
          e.stopPropagation();
          onPull(); // Try again
        }}
        title={`Pull failed: ${gitStatus.pullError}\n\nClick to retry`}
      >
        {gitStatus.branch && (
          <span className="text-[10px] max-w-[50px] truncate mr-0.5">
            {gitStatus.branch}
          </span>
        )}
        <XCircle className="w-3 h-3" />
      </Button>
    );
  }

  // Show warning icon on fetch error (auth required)
  if (gitStatus.fetchError) {
    return (
      <div
        className="shrink-0 flex items-center gap-1 px-1 cursor-help"
        title={buildTooltip()}
      >
        {gitStatus.branch && (
          <span className="text-[10px] text-muted-foreground max-w-[60px] truncate">
            {gitStatus.branch}
          </span>
        )}
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
      </div>
    );
  }

  // Show behind count if behind - clickable to pull
  if (gitStatus.behindCount > 0) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1.5 gap-0.5 text-xs font-medium text-orange-400 hover:text-orange-300 hover:bg-orange-400/10"
        onClick={(e) => {
          e.stopPropagation();
          onPull();
        }}
        title={buildTooltip() + "\n\nClick to pull"}
      >
        {gitStatus.branch && (
          <span className="text-[10px] text-muted-foreground max-w-[50px] truncate mr-0.5">
            {gitStatus.branch}
          </span>
        )}
        <ArrowDown className="w-3 h-3" />
        <span>{gitStatus.behindCount}</span>
      </Button>
    );
  }

  // Up to date - show branch name with check mark, click to pull/refresh
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-5 px-1.5 gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
      onClick={(e) => {
        e.stopPropagation();
        onPull(); // Pull will also refresh status
      }}
      title={buildTooltip() + "\n\nClick to pull & refresh"}
    >
      {gitStatus.branch && (
        <span className="text-[10px] max-w-[60px] truncate">
          {gitStatus.branch}
        </span>
      )}
      <Check className="w-3 h-3 text-green-500" />
    </Button>
  );
}
