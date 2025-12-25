import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Settings, FolderPlus, Trash2, Eye, EyeOff, Check, X, GitBranch, Plus, ChevronDown, Database } from "lucide-react";
import { Preferences, GitToken } from "../types/project";

interface PreferencesModalProps {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onSave: (preferences: Preferences) => void;
  watchedDirs: string[];
  onAddDirectory: (path: string) => void;
  onRemoveDirectory: (path: string) => void;
}

export function PreferencesModal({
  open: isOpen,
  onClose,
  preferences,
  onSave,
  watchedDirs,
  onAddDirectory,
  onRemoveDirectory,
}: PreferencesModalProps) {
  const [ngrokToken, setNgrokToken] = useState(preferences.ngrokAuthToken || "");
  const [webhookPort, setWebhookPort] = useState(preferences.defaultWebhookPort || 3456);
  const [showToken, setShowToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Git settings state
  const [gitEnabled, setGitEnabled] = useState(preferences.git?.enabled ?? true);
  const [gitInterval, setGitInterval] = useState(preferences.git?.pollingIntervalMinutes ?? 10);
  const [gitTokens, setGitTokens] = useState<GitToken[]>(preferences.git?.tokens ?? []);

  // New token form state
  const [newTokenPattern, setNewTokenPattern] = useState("");
  const [newTokenValue, setNewTokenValue] = useState("");
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [showNewToken, setShowNewToken] = useState(false);
  const [gitTokenSaved, setGitTokenSaved] = useState(false);
  const [showSavedConfig, setShowSavedConfig] = useState(false);
  const [configJson, setConfigJson] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNgrokToken(preferences.ngrokAuthToken || "");
      setWebhookPort(preferences.defaultWebhookPort || 3456);
      setTokenSaved(false);
      setTokenError(null);
      // Git settings
      setGitEnabled(preferences.git?.enabled ?? true);
      setGitInterval(preferences.git?.pollingIntervalMinutes ?? 10);
      setGitTokens(preferences.git?.tokens ?? []);
      // Reset new token form
      setNewTokenPattern("");
      setNewTokenValue("");
      setNewTokenLabel("");
      setGitTokenSaved(false);
      // Initialize config JSON
      setConfigJson(JSON.stringify({
        ngrokAuthToken: preferences.ngrokAuthToken || null,
        defaultWebhookPort: preferences.defaultWebhookPort,
        git: preferences.git || { enabled: true, pollingIntervalMinutes: 10, tokens: [] },
        watchedDirs
      }, null, 2));
      setConfigError(null);
      setConfigSaved(false);
    }
  }, [isOpen, preferences, watchedDirs]);

  if (!isOpen) return null;

  const handleAddDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select a directory to scan for projects",
      });

      if (selected && typeof selected === "string") {
        onAddDirectory(selected);
      }
    } catch (error) {
      console.error("Failed to open directory picker:", error);
    }
  };

  const handleSaveNgrokToken = async () => {
    if (!ngrokToken.trim()) return;
    
    setSaving(true);
    setTokenError(null);
    
    try {
      await invoke("set_ngrok_auth_token", { token: ngrokToken.trim() });
      setTokenSaved(true);
      // Also save to preferences
      onSave({ ...preferences, ngrokAuthToken: ngrokToken.trim(), defaultWebhookPort: webhookPort });
      setTimeout(() => setTokenSaved(false), 2000);
    } catch (error) {
      setTokenError(String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePort = () => {
    onSave({
      ...preferences,
      ngrokAuthToken: ngrokToken || undefined,
      defaultWebhookPort: webhookPort,
      git: { enabled: gitEnabled, pollingIntervalMinutes: gitInterval, tokens: gitTokens },
    });
  };

  const handleSaveGitSettings = (tokens: GitToken[] = gitTokens) => {
    onSave({
      ...preferences,
      ngrokAuthToken: ngrokToken || undefined,
      defaultWebhookPort: webhookPort,
      git: { enabled: gitEnabled, pollingIntervalMinutes: gitInterval, tokens },
    });
  };

  const handleAddGitToken = () => {
    if (!newTokenValue.trim()) return;

    const newToken: GitToken = {
      id: crypto.randomUUID(),
      pattern: newTokenPattern.trim() || "*",
      token: newTokenValue.trim(),
      label: newTokenLabel.trim() || undefined,
    };

    const updatedTokens = [...gitTokens, newToken];
    setGitTokens(updatedTokens);
    handleSaveGitSettings(updatedTokens);

    // Show confirmation
    setGitTokenSaved(true);
    setTimeout(() => setGitTokenSaved(false), 2000);

    // Clear form
    setNewTokenPattern("");
    setNewTokenValue("");
    setNewTokenLabel("");
  };

  const handleRemoveGitToken = (id: string) => {
    const updatedTokens = gitTokens.filter((t) => t.id !== id);
    setGitTokens(updatedTokens);
    handleSaveGitSettings(updatedTokens);
  };

  const handleConfigJsonChange = (value: string) => {
    setConfigJson(value);
    setConfigSaved(false);
    // Validate JSON on change
    try {
      JSON.parse(value);
      setConfigError(null);
    } catch (e) {
      setConfigError((e as Error).message);
    }
  };

  const handleSaveConfigJson = () => {
    try {
      const parsed = JSON.parse(configJson);
      // Update all preferences from JSON
      const newPrefs: Preferences = {
        ngrokAuthToken: parsed.ngrokAuthToken || undefined,
        defaultWebhookPort: parsed.defaultWebhookPort || 3456,
        git: {
          enabled: parsed.git?.enabled ?? true,
          pollingIntervalMinutes: parsed.git?.pollingIntervalMinutes ?? 10,
          tokens: parsed.git?.tokens ?? [],
        },
      };

      // Update local state to match
      setNgrokToken(newPrefs.ngrokAuthToken || "");
      setWebhookPort(newPrefs.defaultWebhookPort);
      setGitEnabled(newPrefs.git.enabled);
      setGitInterval(newPrefs.git.pollingIntervalMinutes);
      setGitTokens(newPrefs.git.tokens);

      // Save
      onSave(newPrefs);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch (e) {
      setConfigError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Preferences</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Watched Directories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Watched Directories</label>
              <Button variant="outline" size="sm" onClick={handleAddDirectory} className="gap-1">
                <FolderPlus className="w-4 h-4" />
                Add
              </Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {watchedDirs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No directories added yet</p>
              ) : (
                watchedDirs.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-sm"
                  >
                    <span className="truncate flex-1" title={dir}>{dir}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveDirectory(dir)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Default Webhook Port */}
          <div>
            <label className="text-sm font-medium block mb-2">Default Webhook Port</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={webhookPort}
                onChange={(e) => setWebhookPort(parseInt(e.target.value) || 3456)}
                min={1024}
                max={65535}
                className="flex-1 px-3 py-2 bg-background border border-input rounded-md text-sm"
              />
              <Button variant="secondary" size="sm" onClick={handleSavePort}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Port used when starting the webhook receiver (1024-65535)
            </p>
          </div>

          {/* ngrok Auth Token */}
          <div>
            <label className="text-sm font-medium block mb-2">ngrok Auth Token</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={ngrokToken}
                  onChange={(e) => setNgrokToken(e.target.value)}
                  placeholder="Enter your ngrok auth token"
                  className="w-full px-3 py-2 pr-10 bg-background border border-input rounded-md text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveNgrokToken}
                disabled={saving || !ngrokToken.trim()}
              >
                {saving ? "..." : tokenSaved ? <Check className="w-4 h-4" /> : "Save"}
              </Button>
            </div>
            {tokenError && (
              <p className="text-xs text-destructive mt-1">{tokenError}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Get your token from{" "}
              <a
                href="https://dashboard.ngrok.com/get-started/your-authtoken"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                ngrok dashboard
              </a>
            </p>
          </div>

          {/* Git Integration */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="w-4 h-4" />
              <label className="text-sm font-medium">Git Integration</label>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm">Check for updates</span>
              <button
                type="button"
                onClick={() => {
                  const newEnabled = !gitEnabled;
                  setGitEnabled(newEnabled);
                  onSave({
                    ...preferences,
                    ngrokAuthToken: ngrokToken || undefined,
                    defaultWebhookPort: webhookPort,
                    git: { enabled: newEnabled, pollingIntervalMinutes: gitInterval, tokens: gitTokens },
                  });
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  gitEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-background rounded-full transition-transform ${
                    gitEnabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {/* Polling Interval */}
            {gitEnabled && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">Polling interval</span>
                  <span className="text-sm text-muted-foreground">{gitInterval} min</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={gitInterval}
                  onChange={(e) => setGitInterval(parseInt(e.target.value))}
                  onMouseUp={() => handleSaveGitSettings()}
                  onTouchEnd={() => handleSaveGitSettings()}
                  className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            )}

            {/* Git Tokens List */}
            <div>
              <label className="text-sm block mb-2">Git Tokens (for private repos)</label>

              {/* Existing tokens */}
              {gitTokens.length > 0 && (
                <div className="space-y-1 mb-3 max-h-24 overflow-y-auto">
                  {gitTokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground text-xs">{token.pattern}</span>
                        {token.label && (
                          <span className="ml-2 text-xs text-muted-foreground/70">({token.label})</span>
                        )}
                        <div className="font-mono text-xs truncate">
                          {"•".repeat(Math.min(token.token.length, 20))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemoveGitToken(token.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {gitTokens.length === 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  No tokens configured. Add one for private repo access.
                </p>
              )}

              {/* Add new token form */}
              <div className="space-y-2 p-2 border border-border rounded-md bg-muted/20">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTokenPattern}
                    onChange={(e) => setNewTokenPattern(e.target.value)}
                    placeholder="Pattern (e.g., github.com/org/*)"
                    className="flex-1 px-2 py-1.5 bg-background border border-input rounded text-xs"
                  />
                  <input
                    type="text"
                    value={newTokenLabel}
                    onChange={(e) => setNewTokenLabel(e.target.value)}
                    placeholder="Label (optional)"
                    className="w-24 px-2 py-1.5 bg-background border border-input rounded text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showNewToken ? "text" : "password"}
                      value={newTokenValue}
                      onChange={(e) => setNewTokenValue(e.target.value)}
                      placeholder="Personal access token"
                      className="w-full px-2 py-1.5 pr-8 bg-background border border-input rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewToken(!showNewToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAddGitToken}
                    disabled={!newTokenValue.trim()}
                    className="gap-1"
                  >
                    {gitTokenSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {gitTokenSaved ? "Saved" : "Add"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Pattern examples: <code className="bg-muted px-1 rounded">github.com/org/*</code> or <code className="bg-muted px-1 rounded">*</code> for all repos
                </p>
              </div>
            </div>
          </div>

          {/* Saved Config Editor Section */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowSavedConfig(!showSavedConfig)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full"
            >
              <Database className="w-4 h-4" />
              <span>Config Editor</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showSavedConfig ? "rotate-180" : ""}`} />
            </button>

            {showSavedConfig && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <textarea
                    value={configJson}
                    onChange={(e) => handleConfigJsonChange(e.target.value)}
                    spellCheck={false}
                    className={`w-full h-64 p-3 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs rounded-md border resize-none focus:outline-none focus:ring-1 ${
                      configError
                        ? "border-red-500 focus:ring-red-500"
                        : "border-border focus:ring-primary"
                    }`}
                    style={{ tabSize: 2 }}
                  />
                  {/* JSON validity indicator */}
                  <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                    configError ? "bg-red-500" : "bg-green-500"
                  }`} title={configError || "Valid JSON"} />
                </div>

                {configError && (
                  <p className="text-xs text-red-400 font-mono">
                    ⚠ {configError}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Edit JSON directly • Changes apply when saved
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSaveConfigJson}
                    disabled={!!configError}
                    className="gap-1"
                  >
                    {configSaved ? <Check className="w-3 h-3" /> : null}
                    {configSaved ? "Saved" : "Save Config"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
