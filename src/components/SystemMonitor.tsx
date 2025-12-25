import { useEffect, useState, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Cpu,
  MemoryStick,
  Activity,
  Clock,
  ArrowUpDown,
  X,
  Terminal,
  User,
  Timer,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import { useGlobalSettings } from "../hooks/useSettings";

interface SystemInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  gpu: GpuInfo | null;
  uptime: string;
  load_average: number[];
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

interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  cpu_percent: number;
  memory_mb: number;
  memory_percent: number;
  vsz_mb: number;
  private_mb: number;
  shared_mb: number;
  user: string;
  state: string;
  elapsed: string;
}

interface HistoryPoint {
  time: string;
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  cpuUser: number;
  cpuSystem: number;
}

type SortBy = "memory" | "cpu" | "name";
type SortOrder = "asc" | "desc";

const MAX_HISTORY_POINTS = 60; // 2 minutes at 2s intervals

// Extract parent app name from process command path
function extractAppName(command: string): string | null {
  // Look for .app bundle in the path
  const appMatch = command.match(/\/([^\/]+)\.app\//i);
  if (appMatch) {
    return appMatch[1];
  }
  return null;
}

// Process state badge
function StateBadge({ state }: { state: string }) {
  const stateChar = state.charAt(0).toUpperCase();
  let color = "text-muted-foreground bg-muted/50";
  let label = state;

  switch (stateChar) {
    case "R":
      color = "text-green-400 bg-green-500/20";
      label = "Running";
      break;
    case "S":
      color = "text-blue-400 bg-blue-500/20";
      label = "Sleeping";
      break;
    case "I":
      color = "text-gray-400 bg-gray-500/20";
      label = "Idle";
      break;
    case "U":
      color = "text-yellow-400 bg-yellow-500/20";
      label = "Uninterruptible";
      break;
    case "Z":
      color = "text-red-400 bg-red-500/20";
      label = "Zombie";
      break;
  }

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}
      title={label}
    >
      {stateChar}
    </span>
  );
}

// Memory pressure indicator colors
const PRESSURE_CONFIG = {
  low: { color: "#22c55e", label: "Low", bgColor: "bg-green-500/20" },
  medium: { color: "#eab308", label: "Medium", bgColor: "bg-yellow-500/20" },
  high: { color: "#ef4444", label: "High", bgColor: "bg-red-500/20" },
};

// Memory breakdown colors
const MEMORY_COLORS = {
  app: "#3b82f6",      // Blue
  wired: "#8b5cf6",    // Purple
  compressed: "#eab308", // Yellow
  cached: "#06b6d4",   // Cyan
  free: "#22c55e",     // Green
};

// Memory Breakdown component with stacked bar
function MemoryBreakdown({ memory }: { memory: MemoryInfo }) {
  const { total_gb, app_memory_gb, wired_memory_gb, compressed_gb, cached_files_gb, free_gb, memory_pressure, swap_used_gb } = memory;

  const pressure = PRESSURE_CONFIG[memory_pressure];
  const hasSwap = swap_used_gb > 0.01; // Show if more than 10MB of swap is used

  // Calculate percentages for the stacked bar
  const segments = [
    { key: "app", value: app_memory_gb, color: MEMORY_COLORS.app, label: "App" },
    { key: "wired", value: wired_memory_gb, color: MEMORY_COLORS.wired, label: "Wired" },
    { key: "compressed", value: compressed_gb, color: MEMORY_COLORS.compressed, label: "Compressed" },
    { key: "cached", value: cached_files_gb, color: MEMORY_COLORS.cached, label: "Cached" },
    { key: "free", value: free_gb, color: MEMORY_COLORS.free, label: "Free" },
  ];

  return (
    <div className="bg-muted/10 rounded-xl border border-border/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MemoryStick className="w-5 h-5 text-violet-500" />
          <h3 className="text-sm font-semibold">Memory Breakdown</h3>
          <span className="text-xs text-muted-foreground">
            ({total_gb.toFixed(1)} GB Total)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Pressure:</span>
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: pressure.color }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: pressure.color }}
            >
              {pressure.label}
            </span>
          </div>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex mb-3 bg-muted/20">
        {segments.map((seg) => {
          const percent = (seg.value / total_gb) * 100;
          if (percent < 0.5) return null; // Skip very small segments
          return (
            <div
              key={seg.key}
              className="h-full transition-all duration-500"
              style={{
                width: `${percent}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label}: ${seg.value.toFixed(2)} GB (${percent.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-muted-foreground">{seg.label}:</span>
            <span className="text-xs font-medium">{seg.value.toFixed(1)} GB</span>
          </div>
        ))}
      </div>

      {/* Swap Warning - only show when swap is being used */}
      {hasSwap && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-xs text-red-400">
            <span className="font-semibold">Swap Used:</span> {swap_used_gb.toFixed(2)} GB
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            Disk swap is slow - consider closing apps
          </span>
        </div>
      )}
    </div>
  );
}

// Format memory size with appropriate units
function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

// Process Detail Modal - shows real-time data for a single process
function ProcessDetailModal({
  process,
  onClose,
}: {
  process: ProcessInfo;
  onClose: () => void;
}) {
  const appName = extractAppName(process.command);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{process.name}</h2>
                <StateBadge state={process.state} />
              </div>
              <p className="text-xs text-muted-foreground">
                PID {process.pid}
                {appName && <span className="text-violet-400 ml-2">{appName}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Live Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <Cpu className="w-4 h-4 mx-auto mb-1 text-blue-500" />
              <div className="text-lg font-bold text-blue-500">
                {process.cpu_percent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground">CPU</div>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <MemoryStick className="w-4 h-4 mx-auto mb-1 text-violet-500" />
              <div className="text-lg font-bold text-violet-500">
                {process.memory_percent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground">Memory</div>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 text-center">
              <HardDrive className="w-4 h-4 mx-auto mb-1 text-emerald-500" />
              <div className="text-lg font-bold text-emerald-500">
                {formatMemory(process.memory_mb)}
              </div>
              <div className="text-[10px] text-muted-foreground">RSS</div>
            </div>
          </div>

          {/* Memory Breakdown */}
          <div className="bg-muted/20 rounded-lg p-3">
            <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Memory Breakdown</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Private</span>
                <span className="font-medium text-blue-400">{formatMemory(process.private_mb)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shared</span>
                <span className="font-medium text-cyan-400">{formatMemory(process.shared_mb)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Virtual</span>
                <span className="font-medium">{formatMemory(process.vsz_mb)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">% of RAM</span>
                <span className="font-medium">{process.memory_percent.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="bg-muted/20 rounded-lg p-3">
            <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">User:</span>
                <span className="font-medium">{process.user}</span>
              </div>
              <div className="flex items-center gap-2">
                <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Elapsed:</span>
                <span className="font-medium">{process.elapsed}</span>
              </div>
            </div>
          </div>

          {/* Command */}
          <div className="bg-muted/20 rounded-lg p-3">
            <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Command</h3>
            <div className="text-xs font-mono bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {process.command}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simplified process row component - clickable
function ProcessRow({
  process,
  onClick,
}: {
  process: ProcessInfo;
  onClick: () => void;
}) {
  const appName = extractAppName(process.command);

  return (
    <button
      onClick={onClick}
      className="w-full py-1.5 px-2 hover:bg-muted/30 rounded-lg text-left transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* PID */}
        <div className="w-12 text-xs text-muted-foreground font-mono shrink-0">
          {process.pid}
        </div>
        {/* Process Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{process.name}</span>
            <StateBadge state={process.state} />
          </div>
        </div>
        {/* App */}
        <div className="w-24 text-xs truncate shrink-0">
          {appName ? (
            <span className="text-violet-400">{appName}</span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </div>
        {/* Mem % */}
        <div className="w-14 text-right text-xs text-muted-foreground shrink-0">
          {process.memory_percent.toFixed(1)}%
        </div>
        {/* RSS */}
        <div className="w-16 text-right text-xs font-medium shrink-0">
          {formatMemory(process.memory_mb)}
        </div>
        {/* CPU % */}
        <div className="w-14 text-right text-xs text-muted-foreground shrink-0">
          {process.cpu_percent.toFixed(1)}%
        </div>
      </div>
    </button>
  );
}

// Column header with sort indicator
function ColumnHeader({
  label,
  sortKey,
  currentSort,
  order,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortBy;
  currentSort: SortBy;
  order: SortOrder;
  onClick: (key: SortBy) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`text-left hover:text-foreground transition-colors flex items-center gap-0.5 ${className} ${
        isActive ? "text-violet-400" : ""
      }`}
    >
      {label}
      {isActive && (
        <ArrowUpDown
          className={`w-2.5 h-2.5 transition-transform ${order === "asc" ? "rotate-180" : ""}`}
        />
      )}
    </button>
  );
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-background border border-border rounded-lg p-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toFixed(1)}%
        </p>
      ))}
    </div>
  );
}

export function SystemMonitor() {
  const { settings, updateSettings } = useGlobalSettings();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [_loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>(settings.processSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    settings.processSortOrder
  );
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const historyRef = useRef<HistoryPoint[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);

  // Persist sort changes
  useEffect(() => {
    updateSettings({ processSortBy: sortBy, processSortOrder: sortOrder });
  }, [sortBy, sortOrder, updateSettings]);

  // Sort processes
  const sortedProcesses = useMemo(() => {
    const sorted = [...processes];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "memory":
          comparison = a.memory_mb - b.memory_mb;
          break;
        case "cpu":
          comparison = a.cpu_percent - b.cpu_percent;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });
    return sorted;
  }, [processes, sortBy, sortOrder]);

  const handleSortClick = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(newSortBy);
      setSortOrder("desc");
    }
  };

  const fetchSystemInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SystemInfo>("get_system_info");
      setSystemInfo(result);

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const newPoint: HistoryPoint = {
        time: timeStr,
        timestamp: now.getTime(),
        cpu: result.cpu.usage_percent,
        memory: result.memory.usage_percent,
        disk: result.disk.usage_percent,
        cpuUser: result.cpu.user_percent,
        cpuSystem: result.cpu.system_percent,
      };

      historyRef.current = [...historyRef.current, newPoint].slice(
        -MAX_HISTORY_POINTS
      );
      setHistory(historyRef.current);
    } catch (err) {
      console.error("System info fetch failed:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchProcesses = async () => {
    try {
      const result = await invoke<ProcessInfo[]>("get_top_processes", {
        limit: 20,
      });
      setProcesses(result);
    } catch (err) {
      console.error("Process fetch failed:", err);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
    fetchProcesses();
    // Refresh every 2 seconds for real-time feel
    const interval = setInterval(() => {
      fetchSystemInfo();
      fetchProcesses();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-sm font-medium text-red-400">
          Failed to load system info
        </p>
        <p className="text-xs mt-1 text-center max-w-xs">{error}</p>
      </div>
    );
  }

  if (!systemInfo) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Activity className="w-8 h-8 animate-pulse mb-4 opacity-50" />
        <p className="text-sm">Loading system info...</p>
      </div>
    );
  }

  const { uptime } = systemInfo;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">System Monitor</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Uptime: {uptime}
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-6">
          {/* CPU & Memory Graph */}
          <div className="bg-muted/10 rounded-xl border border-border/30 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-semibold">CPU & Memory Usage</h3>
              <span className="text-xs text-muted-foreground ml-auto">
                Last {Math.floor(history.length * 2)} seconds
              </span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={history}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#3b82f6"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="colorMemory"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#8b5cf6"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#8b5cf6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#333"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="#666"
                    fontSize={10}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#666"
                    fontSize={10}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    iconType="circle"
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name="CPU"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCpu)"
                  />
                  <Area
                    type="monotone"
                    dataKey="memory"
                    name="Memory"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorMemory)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CPU Breakdown Graph */}
          <div className="bg-muted/10 rounded-xl border border-border/30 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5 text-blue-500" />
              <h3 className="text-sm font-semibold">
                CPU Breakdown (User vs System)
              </h3>
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={history}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="colorUser"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#3b82f6"
                        stopOpacity={0.5}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="colorSystem"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#ef4444"
                        stopOpacity={0.5}
                      />
                      <stop
                        offset="95%"
                        stopColor="#ef4444"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#333"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="#666"
                    fontSize={10}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#666"
                    fontSize={10}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    iconType="circle"
                  />
                  <Area
                    type="monotone"
                    dataKey="cpuUser"
                    name="User"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUser)"
                    stackId="1"
                  />
                  <Area
                    type="monotone"
                    dataKey="cpuSystem"
                    name="System"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSystem)"
                    stackId="1"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Memory Breakdown */}
          <MemoryBreakdown memory={systemInfo.memory} />

          {/* Process List */}
          <div className="bg-muted/10 rounded-xl border border-border/30 p-4 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-3">
              <MemoryStick className="w-5 h-5 text-violet-500" />
              <h3 className="text-sm font-semibold">Top Processes</h3>
              <span className="text-xs text-muted-foreground ml-auto">
                {sortedProcesses.length} processes • Click for details
              </span>
            </div>

            {/* Header row */}
            <div className="flex items-center gap-3 py-2 px-2 text-xs text-muted-foreground border-b border-border/50 mb-1">
              <div className="w-12 shrink-0">PID</div>
              <div className="flex-1">
                <ColumnHeader
                  label="Process"
                  sortKey="name"
                  currentSort={sortBy}
                  order={sortOrder}
                  onClick={handleSortClick}
                />
              </div>
              <div className="w-24 shrink-0">App</div>
              <div className="w-14 text-right shrink-0">
                <ColumnHeader
                  label="Mem %"
                  sortKey="memory"
                  currentSort={sortBy}
                  order={sortOrder}
                  onClick={handleSortClick}
                  className="justify-end"
                />
              </div>
              <div className="w-16 text-right shrink-0">RSS</div>
              <div className="w-14 text-right shrink-0">
                <ColumnHeader
                  label="CPU %"
                  sortKey="cpu"
                  currentSort={sortBy}
                  order={sortOrder}
                  onClick={handleSortClick}
                  className="justify-end"
                />
              </div>
            </div>

            <div className="space-y-0.5 flex-1 overflow-auto">
              {sortedProcesses.map((process) => (
                <ProcessRow
                  key={process.pid}
                  process={process}
                  onClick={() => setSelectedProcess(process)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Process Detail Modal */}
      {selectedProcess && (
        <ProcessDetailModal
          process={selectedProcess}
          onClose={() => setSelectedProcess(null)}
        />
      )}
    </div>
  );
}
