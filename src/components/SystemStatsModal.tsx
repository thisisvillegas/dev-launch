import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Cpu, MemoryStick, HardDrive, MonitorDot } from "lucide-react";

interface SystemInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  gpu: GpuInfo | null;
}

interface CpuInfo {
  usage_percent: number;
  user_percent: number;
  system_percent: number;
  idle_percent: number;
  core_count: number;
  model: string;
}

interface MemoryInfo {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  app_memory_gb: number;
  wired_memory_gb: number;
  compressed_gb: number;
  cached_files_gb: number;
  memory_pressure: "low" | "medium" | "high";
  swap_total_gb: number;
  swap_used_gb: number;
}

interface DiskInfo {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
}

interface GpuInfo {
  name: string;
  vendor: string;
  vram_mb: number | null;
}

function ProgressBar({
  value,
  max,
  color,
  label,
  rightLabel,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
  rightLabel?: string;
}) {
  const percent = Math.min((value / max) * 100, 100);

  return (
    <div className="space-y-1">
      {(label || rightLabel) && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{rightLabel}</span>
        </div>
      )}
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function getUsageColor(percent: number) {
  if (percent < 50) return "#22c55e";
  if (percent < 75) return "#eab308";
  return "#ef4444";
}

export function SystemStatsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (!open) return;

    const fetchStats = async () => {
      try {
        const result = await invoke<SystemInfo>("get_system_info");
        setStats(result);
      } catch (err) {
        console.error("Failed to fetch system stats:", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h2 className="text-sm font-semibold">System Details</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!stats ? (
          <div className="p-8 text-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* CPU */}
            <div className="bg-muted/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#3b82f620" }}
                >
                  <Cpu className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">CPU</h3>
                  <p
                    className="text-xs text-muted-foreground truncate max-w-[280px]"
                    title={stats.cpu.model}
                  >
                    {stats.cpu.model}
                  </p>
                </div>
                <span className="text-lg font-bold text-blue-500">
                  {stats.cpu.usage_percent.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-2">
                <ProgressBar
                  value={stats.cpu.user_percent}
                  max={100}
                  color="#3b82f6"
                  label="User"
                  rightLabel={`${stats.cpu.user_percent.toFixed(1)}%`}
                />
                <ProgressBar
                  value={stats.cpu.system_percent}
                  max={100}
                  color="#8b5cf6"
                  label="System"
                  rightLabel={`${stats.cpu.system_percent.toFixed(1)}%`}
                />
                <ProgressBar
                  value={stats.cpu.idle_percent}
                  max={100}
                  color="#22c55e"
                  label="Idle"
                  rightLabel={`${stats.cpu.idle_percent.toFixed(1)}%`}
                />
                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                  <span>Cores: {stats.cpu.core_count}</span>
                </div>
              </div>
            </div>

            {/* Memory */}
            <div className="bg-muted/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#8b5cf620" }}
                >
                  <MemoryStick className="w-4 h-4 text-violet-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">Memory</h3>
                  <p className="text-xs text-muted-foreground">
                    {stats.memory.total_gb.toFixed(1)} GB Total
                  </p>
                </div>
                <span className="text-lg font-bold text-violet-500">
                  {stats.memory.usage_percent.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-2">
                <ProgressBar
                  value={stats.memory.app_memory_gb}
                  max={stats.memory.total_gb}
                  color="#3b82f6"
                  label="App Memory"
                  rightLabel={`${stats.memory.app_memory_gb.toFixed(2)} GB`}
                />
                <ProgressBar
                  value={stats.memory.wired_memory_gb}
                  max={stats.memory.total_gb}
                  color="#ef4444"
                  label="Wired"
                  rightLabel={`${stats.memory.wired_memory_gb.toFixed(2)} GB`}
                />
                <ProgressBar
                  value={stats.memory.compressed_gb}
                  max={stats.memory.total_gb}
                  color="#eab308"
                  label="Compressed"
                  rightLabel={`${stats.memory.compressed_gb.toFixed(2)} GB`}
                />
                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                  <span>Used: {stats.memory.used_gb.toFixed(1)} GB</span>
                  <span>Free: {stats.memory.free_gb.toFixed(1)} GB</span>
                </div>
              </div>
            </div>

            {/* Disk */}
            <div className="bg-muted/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#22c55e20" }}
                >
                  <HardDrive className="w-4 h-4 text-green-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">Disk</h3>
                  <p className="text-xs text-muted-foreground">
                    {stats.disk.free_gb.toFixed(0)} GB Free
                  </p>
                </div>
                <span
                  className="text-lg font-bold"
                  style={{ color: getUsageColor(stats.disk.usage_percent) }}
                >
                  {stats.disk.usage_percent.toFixed(0)}%
                </span>
              </div>
              <ProgressBar
                value={stats.disk.used_gb}
                max={stats.disk.total_gb}
                color={getUsageColor(stats.disk.usage_percent)}
                label="Used Space"
                rightLabel={`${stats.disk.used_gb.toFixed(0)} / ${stats.disk.total_gb.toFixed(0)} GB`}
              />
            </div>

            {/* GPU */}
            <div className="bg-muted/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#f9731620" }}
                >
                  <MonitorDot className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">GPU</h3>
                  <p className="text-xs text-muted-foreground">
                    {stats.gpu?.name || "Not detected"}
                  </p>
                </div>
              </div>
              {stats.gpu ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vendor</span>
                    <span className="font-medium">{stats.gpu.vendor || "—"}</span>
                  </div>
                  {stats.gpu.vram_mb && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">VRAM</span>
                      <span className="font-medium">
                        {stats.gpu.vram_mb >= 1024
                          ? `${(stats.gpu.vram_mb / 1024).toFixed(0)} GB`
                          : `${stats.gpu.vram_mb} MB`}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No dedicated GPU detected
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
