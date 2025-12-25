import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "./ui/button";
import {
  RefreshCw,
  Globe,
  ExternalLink,
  Zap,
  Database,
  Server,
  Radio,
  Container,
  Code2,
  Skull,
  Clock,
  Cpu,
  User,
  Terminal,
  Copy,
  Check
} from "lucide-react";

interface PortInfo {
  port: number;
  pid: number;
  process_name: string;
  address: string;
  command: string;
  uptime: string;
  cpu_percent: number;
  mem_percent: number;
  user: string;
}

// Categorize ports by common use cases
function getPortCategory(port: number, processName: string): {
  icon: React.ReactNode;
  color: string;
  dotColor: string;
  label: string;
} {
  const lowerName = processName.toLowerCase();

  // Database ports
  if ([5432, 3306, 27017, 6379, 5984, 9200].includes(port) ||
      lowerName.includes('postgres') || lowerName.includes('mysql') ||
      lowerName.includes('mongo') || lowerName.includes('redis')) {
    return {
      icon: <Database className="w-4 h-4" />,
      color: "text-violet-400",
      dotColor: "bg-violet-500",
      label: "Database"
    };
  }

  // Docker
  if (lowerName.includes('docker') || lowerName.includes('containerd')) {
    return {
      icon: <Container className="w-4 h-4" />,
      color: "text-blue-400",
      dotColor: "bg-blue-500",
      label: "Docker"
    };
  }

  // Node/Dev servers (3000-5999)
  if (port >= 3000 && port <= 5999) {
    return {
      icon: <Code2 className="w-4 h-4" />,
      color: "text-green-400",
      dotColor: "bg-green-500",
      label: "Dev Server"
    };
  }

  // Common web ports
  if ([80, 443, 8080, 8443, 8000, 8888].includes(port)) {
    return {
      icon: <Globe className="w-4 h-4" />,
      color: "text-cyan-400",
      dotColor: "bg-cyan-500",
      label: "Web"
    };
  }

  // Default - generic service
  return {
    icon: <Server className="w-4 h-4" />,
    color: "text-zinc-400",
    dotColor: "bg-zinc-500",
    label: "Service"
  };
}

// Database connection info
interface DatabaseConnectionInfo {
  type: string;
  connectionString: string;
  host: string;
  defaultDatabase?: string;
  defaultUser?: string;
  cliCommand?: string;
}

function getDatabaseInfo(port: number, processName: string, address: string): DatabaseConnectionInfo | null {
  const lowerName = processName.toLowerCase();
  const host = address === "0.0.0.0" || address === "*" ? "localhost" : address;

  // PostgreSQL
  if (port === 5432 || lowerName.includes('postgres')) {
    return {
      type: "PostgreSQL",
      connectionString: `postgresql://postgres@${host}:${port}/postgres`,
      host: `${host}:${port}`,
      defaultDatabase: "postgres",
      defaultUser: "postgres",
      cliCommand: `psql -h ${host} -p ${port} -U postgres`
    };
  }

  // MySQL
  if (port === 3306 || lowerName.includes('mysql') || lowerName.includes('mariadb')) {
    return {
      type: "MySQL",
      connectionString: `mysql://root@${host}:${port}`,
      host: `${host}:${port}`,
      defaultUser: "root",
      cliCommand: `mysql -h ${host} -P ${port} -u root`
    };
  }

  // MongoDB
  if (port === 27017 || lowerName.includes('mongo')) {
    return {
      type: "MongoDB",
      connectionString: `mongodb://${host}:${port}`,
      host: `${host}:${port}`,
      cliCommand: `mongosh "mongodb://${host}:${port}"`
    };
  }

  // Redis
  if (port === 6379 || lowerName.includes('redis')) {
    return {
      type: "Redis",
      connectionString: `redis://${host}:${port}`,
      host: `${host}:${port}`,
      cliCommand: `redis-cli -h ${host} -p ${port}`
    };
  }

  // Elasticsearch
  if (port === 9200 || lowerName.includes('elastic')) {
    return {
      type: "Elasticsearch",
      connectionString: `http://${host}:${port}`,
      host: `${host}:${port}`,
      cliCommand: `curl ${host}:${port}`
    };
  }

  // CouchDB
  if (port === 5984 || lowerName.includes('couch')) {
    return {
      type: "CouchDB",
      connectionString: `http://${host}:${port}`,
      host: `${host}:${port}`,
      cliCommand: `curl ${host}:${port}/_all_dbs`
    };
  }

  return null;
}

// Format uptime for display (e.g., "01:23:45" -> "1h 23m")
function formatUptime(uptime: string): string {
  if (!uptime) return "";

  // Format can be: "MM:SS", "HH:MM:SS", or "D-HH:MM:SS"
  const parts = uptime.split(/[-:]/);

  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (mins === 0) return `${secs}s`;
    return `${mins}m`;
  }

  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  }

  if (parts.length === 4) {
    const days = parseInt(parts[0], 10);
    const hours = parseInt(parts[1], 10);
    return `${days}d ${hours}h`;
  }

  return uptime;
}

export function PortMonitor() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  const scanPorts = async () => {
    setLoading(true);
    try {
      const result = await invoke<PortInfo[]>("scan_ports");
      setPorts(result);
    } catch (err) {
      console.error("Port scan failed:", err);
      setPorts([]);
    } finally {
      setLoading(false);
    }
  };

  const killProcess = async (pid: number) => {
    setKillingPid(pid);
    try {
      await invoke("kill_process", { pid });
      // Refresh the list after killing
      await scanPorts();
    } catch (err) {
      console.error("Failed to kill process:", err);
    } finally {
      setKillingPid(null);
    }
  };

  useEffect(() => {
    scanPorts();
    // Auto-refresh every 10 seconds
    const interval = setInterval(scanPorts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Group ports by category
  const devPorts = ports.filter(p => p.port >= 3000 && p.port <= 9999);
  const otherPorts = ports.filter(p => p.port < 3000 || p.port > 9999);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Radio className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Port Monitor</h2>
            <p className="text-xs text-muted-foreground">
              {ports.length} active {ports.length === 1 ? 'port' : 'ports'}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={scanPorts}
          disabled={loading}
          className="h-8 gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Port List */}
      <div className="flex-1 overflow-auto">
        {ports.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 opacity-30" />
            </div>
            <p className="text-sm font-medium">No active ports</p>
            <p className="text-xs mt-1 opacity-70">Start a dev server to see it here</p>
          </div>
        ) : (
          <div>
            {/* Dev Ports Section */}
            {devPorts.length > 0 && (
              <section>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Development Servers ({devPorts.length})
                  </h3>
                </div>
                <div className="divide-y divide-border/50">
                  {devPorts.map((port) => (
                    <PortRow
                      key={`${port.port}-${port.pid}`}
                      port={port}
                      onKill={killProcess}
                      killing={killingPid === port.pid}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Other Ports Section */}
            {otherPorts.length > 0 && (
              <section>
                <div className="px-4 py-2 bg-muted/30 border-y border-border">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    System Services ({otherPorts.length})
                  </h3>
                </div>
                <div className="divide-y divide-border/50">
                  {otherPorts.map((port) => (
                    <PortRow
                      key={`${port.port}-${port.pid}`}
                      port={port}
                      onKill={killProcess}
                      killing={killingPid === port.pid}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PortRow({
  port,
  onKill,
  killing
}: {
  port: PortInfo;
  onKill: (pid: number) => void;
  killing: boolean;
}) {
  const category = getPortCategory(port.port, port.process_name);
  const isWebPort = port.port >= 3000 && port.port <= 9999;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const dbInfo = getDatabaseInfo(port.port, port.process_name, port.address);

  const handleOpen = () => {
    open(`http://localhost:${port.port}`);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="group">
      {/* Main Row */}
      <div
        className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Live dot + Category icon */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-2 h-2 rounded-full ${category.dotColor} animate-pulse`} />
          <div className={category.color}>
            {category.icon}
          </div>
        </div>

        {/* Port Number */}
        <div className="w-20 shrink-0">
          <span className={`text-lg font-bold font-mono ${category.color}`}>
            :{port.port}
          </span>
        </div>

        {/* Process Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate" title={port.process_name}>
              {port.process_name}
            </p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${category.color} bg-current/10`}>
              {category.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <span className="opacity-60">PID</span> {port.pid}
            </span>
            {port.uptime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 opacity-60" />
                {formatUptime(port.uptime)}
              </span>
            )}
            {port.cpu_percent > 0 && (
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 opacity-60" />
                {port.cpu_percent.toFixed(1)}%
              </span>
            )}
            {port.mem_percent > 0 && (
              <span className="opacity-60">
                {port.mem_percent.toFixed(1)}% mem
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isWebPort && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-2"
              onClick={(e) => {
                e.stopPropagation();
                handleOpen();
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="text-xs">Open</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
            disabled={killing}
            onClick={(e) => {
              e.stopPropagation();
              onKill(port.pid);
            }}
          >
            <Skull className="w-3.5 h-3.5" />
            <span className="text-xs">{killing ? "Killing..." : "Kill"}</span>
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 py-3 bg-muted/20 border-t border-border/30 space-y-4">
          {/* Database Connection Info */}
          {dbInfo && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-semibold text-violet-400">{dbInfo.type} Connection</span>
              </div>
              <div className="space-y-2">
                {/* Connection String */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">Connection String</span>
                    <code className="text-[11px] font-mono text-foreground block truncate" title={dbInfo.connectionString}>
                      {dbInfo.connectionString}
                    </code>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(dbInfo.connectionString, "conn");
                    }}
                    title="Copy connection string"
                  >
                    {copied === "conn" ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>

                {/* CLI Command */}
                {dbInfo.cliCommand && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">CLI Command</span>
                      <code className="text-[11px] font-mono text-foreground block truncate" title={dbInfo.cliCommand}>
                        {dbInfo.cliCommand}
                      </code>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(dbInfo.cliCommand!, "cli");
                      }}
                      title="Copy CLI command"
                    >
                      {copied === "cli" ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                )}

                {/* Quick Info */}
                <div className="flex gap-4 text-[11px] pt-1">
                  {dbInfo.defaultUser && (
                    <span className="text-muted-foreground">
                      User: <span className="text-foreground font-mono">{dbInfo.defaultUser}</span>
                    </span>
                  )}
                  {dbInfo.defaultDatabase && (
                    <span className="text-muted-foreground">
                      DB: <span className="text-foreground font-mono">{dbInfo.defaultDatabase}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Process Details */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            {port.command && (
              <div className="col-span-2">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Terminal className="w-3 h-3" />
                  <span className="uppercase tracking-wider text-[10px] font-medium">Command</span>
                </div>
                <code className="block text-[11px] font-mono bg-background/50 rounded px-2 py-1.5 truncate" title={port.command}>
                  {port.command}
                </code>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <User className="w-3 h-3" />
                <span className="uppercase tracking-wider text-[10px] font-medium">User</span>
              </div>
              <span className="text-foreground">{port.user || "—"}</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Globe className="w-3 h-3" />
                <span className="uppercase tracking-wider text-[10px] font-medium">Address</span>
              </div>
              <span className="font-mono text-foreground">
                {port.address === "0.0.0.0" ? "all interfaces" : port.address}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
