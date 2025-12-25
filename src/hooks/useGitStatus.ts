import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app-store";
import { GitToken } from "../types/project";

interface GitStatusResult {
  isGitRepo: boolean;
  branch: string | null;
  remote: string | null;
  behindCount: number;
  error: string | null;
}

interface GitPullResult {
  success: boolean;
  message: string;
  commitsPulled: number;
}

interface UseGitStatusOptions {
  enabled: boolean;
  pollingIntervalMinutes: number;
  tokens: GitToken[];
}

export function useGitStatus(options: UseGitStatusOptions) {
  const { enabled, pollingIntervalMinutes, tokens } = options;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { projects, updateGitStatus } = useAppStore();

  // Check git status for a single project
  const checkProjectStatus = useCallback(
    async (path: string) => {
      try {
        const result = await invoke<GitStatusResult>("git_status", {
          path,
          tokens,
        });

        updateGitStatus(path, {
          isGitRepo: result.isGitRepo,
          branch: result.branch,
          remote: result.remote,
          behindCount: result.behindCount,
          lastChecked: new Date(),
          fetchError: result.error,
          isPulling: false,
        });
      } catch (err) {
        console.error(`[Git] Failed to check status for ${path}:`, err);
        updateGitStatus(path, {
          fetchError: String(err),
          lastChecked: new Date(),
        });
      }
    },
    [tokens, updateGitStatus]
  );

  // Check all projects
  const checkAllProjects = useCallback(async () => {
    if (!enabled) return;

    const projectPaths = projects.map((p) => p.path);
    console.log(`[Git] Checking ${projectPaths.length} projects...`);

    // Check projects in parallel but with some throttling
    const batchSize = 5;
    for (let i = 0; i < projectPaths.length; i += batchSize) {
      const batch = projectPaths.slice(i, i + batchSize);
      await Promise.all(batch.map(checkProjectStatus));
    }
  }, [enabled, projects, checkProjectStatus]);

  // Refresh a specific project
  const refreshProject = useCallback(
    async (path: string) => {
      await checkProjectStatus(path);
    },
    [checkProjectStatus]
  );

  // Pull updates for a project
  const pullProject = useCallback(
    async (path: string): Promise<{ success: boolean; message: string }> => {
      // Mark as pulling, clear any previous pull error
      updateGitStatus(path, { isPulling: true, pullError: null });

      try {
        const result = await invoke<GitPullResult>("git_pull", {
          path,
          tokens,
        });

        // Update with result - show error if pull failed
        if (!result.success) {
          updateGitStatus(path, {
            isPulling: false,
            pullError: result.message
          });
        } else {
          // Refresh status after successful pull
          await checkProjectStatus(path);
        }

        return {
          success: result.success,
          message: result.message,
        };
      } catch (err) {
        updateGitStatus(path, {
          isPulling: false,
          pullError: String(err)
        });
        return {
          success: false,
          message: String(err),
        };
      }
    },
    [tokens, updateGitStatus, checkProjectStatus]
  );

  // Initial check on mount
  useEffect(() => {
    if (enabled && projects.length > 0) {
      // Small delay to let the app settle
      const timeout = setTimeout(() => {
        checkAllProjects();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [enabled]); // Only run on mount/enabled change, not when projects change

  // Set up polling interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || pollingIntervalMinutes <= 0) {
      return;
    }

    const intervalMs = pollingIntervalMinutes * 60 * 1000;
    console.log(`[Git] Setting up polling every ${pollingIntervalMinutes} minutes`);

    intervalRef.current = setInterval(() => {
      checkAllProjects();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollingIntervalMinutes, checkAllProjects]);

  return {
    refreshProject,
    pullProject,
    checkAllProjects,
  };
}
