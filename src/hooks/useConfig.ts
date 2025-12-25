import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app-store";
import { AppConfig, Preferences, GitPreferences } from "../types/project";

// Debounce delay for saving (ms)
const SAVE_DEBOUNCE_MS = 1000;

const DEFAULT_GIT_PREFERENCES: GitPreferences = {
  enabled: true,
  pollingIntervalMinutes: 10,
  tokens: [],
};

const DEFAULT_PREFERENCES: Preferences = {
  defaultWebhookPort: 3456,
  git: DEFAULT_GIT_PREFERENCES,
};

// Deep merge preferences to handle nested git object
function mergePreferences(defaults: Preferences, loaded: Partial<Preferences> | undefined): Preferences {
  if (!loaded) return defaults;

  return {
    ...defaults,
    ...loaded,
    git: {
      ...DEFAULT_GIT_PREFERENCES,
      ...(loaded.git || {}),
    },
  };
}

export function useConfig() {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const [preferences, setPreferencesState] = useState<Preferences>(DEFAULT_PREFERENCES);

  // Subscribe to store changes for watchedDirs and presets
  const watchedDirs = useAppStore((state) => state.watchedDirs);
  const presets = useAppStore((state) => state.presets);

  // Load config on mount - use empty deps to run only once
  useEffect(() => {
    if (isLoadedRef.current || isLoadingRef.current) return;
    isLoadingRef.current = true;

    async function loadConfig() {
      try {
        const config = await invoke<AppConfig>("load_config");
        console.log("[Config] Loaded:", config);

        // Get store actions directly to avoid dependency issues
        const { scanDirectory, setPresets } = useAppStore.getState();

        if (config.watchedDirs?.length > 0) {
          console.log("[Config] Restoring watched dirs:", config.watchedDirs);
          // Scan each watched directory to restore projects
          for (const dir of config.watchedDirs) {
            await scanDirectory(dir);
          }
        }

        if (config.presets?.length > 0) {
          setPresets(config.presets);
        }

        // Deep merge preferences
        const mergedPrefs = mergePreferences(DEFAULT_PREFERENCES, config.preferences);
        console.log("[Config] Merged preferences:", mergedPrefs);
        setPreferencesState(mergedPrefs);

        isLoadedRef.current = true;
      } catch (err) {
        console.error("[Config] Failed to load:", err);
      } finally {
        isLoadingRef.current = false;
      }
    }

    loadConfig();
  }, []); // Empty deps - run once on mount

  // Debounced save function - always gets fresh state
  const saveConfig = useCallback((currentPreferences: Preferences) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!isLoadedRef.current) return;

      // Get fresh state from store
      const { watchedDirs, presets } = useAppStore.getState();

      const config: AppConfig = {
        watchedDirs,
        presets,
        preferences: currentPreferences,
      };

      try {
        await invoke("save_config", { config });
        console.log("[Config] Saved:", config);
      } catch (err) {
        console.error("[Config] Failed to save:", err);
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Function to update preferences
  const setPreferences = useCallback((newPrefs: Preferences) => {
    setPreferencesState(newPrefs);
  }, []);

  // Save whenever watchedDirs, presets, or preferences change
  useEffect(() => {
    if (!isLoadedRef.current) return;
    saveConfig(preferences);
  }, [watchedDirs, presets, preferences, saveConfig]);

  // Save immediately on unmount (don't lose pending changes)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Save immediately instead of cancelling
        if (isLoadedRef.current) {
          const { watchedDirs, presets } = useAppStore.getState();
          const config: AppConfig = {
            watchedDirs,
            presets,
            preferences,
          };
          invoke("save_config", { config }).catch(console.error);
        }
      }
    };
  }, [preferences]);

  return { preferences, setPreferences };
}
