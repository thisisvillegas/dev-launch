import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SystemStatsModal } from "./SystemStatsModal";

interface SystemInfo {
  cpu: { usage_percent: number };
  memory: { usage_percent: number };
  disk: { usage_percent: number };
}

// Fixed colors matching system monitor theme
const STAT_COLORS = {
  cpu: "#3b82f6",      // Blue
  memory: "#8b5cf6",   // Violet
  disk: "#10b981",     // Emerald
};

function MiniBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const percent = Math.min(value, 100);
  // Dim the color when low, brighten when high
  const opacity = 0.4 + (percent / 100) * 0.6;

  return (
    <div className="flex items-center gap-1.5">
      <span 
        className="text-[10px] font-medium w-7"
        style={{ color, opacity: 0.8 }}
      >
        {label}
      </span>
      <div className="w-20 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: color, opacity }}
        />
      </div>
      <span
        className="text-[10px] font-semibold w-7 text-right"
        style={{ color }}
      >
        {Math.round(value)}%
      </span>
    </div>
  );
}

export function SystemStats() {
  const [stats, setStats] = useState<SystemInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
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
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center gap-3 opacity-50">
        <MiniBar label="CPU" value={0} color={STAT_COLORS.cpu} />
        <MiniBar label="MEM" value={0} color={STAT_COLORS.memory} />
        <MiniBar label="DSK" value={0} color={STAT_COLORS.disk} />
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-3 px-2 py-1 -mx-2 -my-1 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
        title="Click for details"
      >
        <MiniBar label="CPU" value={stats.cpu.usage_percent} color={STAT_COLORS.cpu} />
        <MiniBar label="MEM" value={stats.memory.usage_percent} color={STAT_COLORS.memory} />
        <MiniBar label="DSK" value={stats.disk.usage_percent} color={STAT_COLORS.disk} />
      </button>
      <SystemStatsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
