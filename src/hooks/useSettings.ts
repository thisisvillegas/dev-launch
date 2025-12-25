import { useState, useEffect, useCallback } from "react";

export interface AppSettings {
  // System Monitor settings
  processSortBy: "memory" | "cpu" | "name";
  processSortOrder: "asc" | "desc";

  // General app settings
  watchedDirectories: string[];
  sidebarWidth: number;
  activeTab: "logs" | "ports" | "system";
}

const DEFAULT_SETTINGS: AppSettings = {
  processSortBy: "memory",
  processSortOrder: "desc",
  watchedDirectories: [],
  sidebarWidth: 256,
  activeTab: "logs",
};

const STORAGE_KEY = "devlaunch-settings";

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added later
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);

  // Save settings whenever they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}

// Create a singleton-like hook for global access
let globalSettings: AppSettings = loadSettings();
const listeners: Set<(settings: AppSettings) => void> = new Set();

export function useGlobalSettings() {
  const [settings, setSettings] = useState<AppSettings>(globalSettings);

  useEffect(() => {
    const listener = (newSettings: AppSettings) => {
      setSettings(newSettings);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    globalSettings = { ...globalSettings, ...updates };
    saveSettings(globalSettings);
    listeners.forEach((l) => l(globalSettings));
  }, []);

  return {
    settings,
    updateSettings,
  };
}
