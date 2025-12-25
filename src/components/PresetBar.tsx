import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { Button } from "./ui/button";
import { Play, Plus, X } from "lucide-react";

export function PresetBar() {
  const { presets, runPreset, deletePreset, createPreset, projects } = useAppStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const runningCount = projects.filter((p) => p.status === "running").length;

  const handleCreatePreset = () => {
    if (newPresetName.trim()) {
      createPreset(newPresetName.trim());
      setNewPresetName("");
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Presets:
      </span>

      {presets.map((preset) => (
        <div
          key={preset.id}
          className="flex items-center gap-1 bg-secondary rounded-md px-2 py-1"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => runPreset(preset.id)}
          >
            <Play className="w-3 h-3" />
            {preset.name}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={() => deletePreset(preset.id)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}

      {isCreating ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreatePreset()}
            placeholder="Preset name..."
            className="h-7 px-2 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleCreatePreset}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setIsCreating(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setIsCreating(true)}
          disabled={runningCount === 0}
          title={runningCount === 0 ? "Start some projects first" : "Save running projects as preset"}
        >
          <Plus className="w-3 h-3" />
          New Preset
          {runningCount > 0 && (
            <span className="text-muted-foreground">({runningCount})</span>
          )}
        </Button>
      )}
    </div>
  );
}
