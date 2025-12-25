import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "./ui/button";
import {
  Webhook,
  Play,
  Square,
  Copy,
  Check,
  Trash2,
  ChevronRight,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  WifiOff,
  Activity,
} from "lucide-react";

interface WebhookEvent {
  id: string;
  timestamp: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  query: string;
}

interface NgrokTunnelInfo {
  public_url: string;
  request_count: number;
  connection_count: number;
}

// Method badge colors
function getMethodStyle(method: string): { bg: string; text: string } {
  switch (method.toUpperCase()) {
    case "GET":
      return { bg: "bg-green-500/20", text: "text-green-400" };
    case "POST":
      return { bg: "bg-blue-500/20", text: "text-blue-400" };
    case "PUT":
      return { bg: "bg-yellow-500/20", text: "text-yellow-400" };
    case "PATCH":
      return { bg: "bg-orange-500/20", text: "text-orange-400" };
    case "DELETE":
      return { bg: "bg-red-500/20", text: "text-red-400" };
    default:
      return { bg: "bg-zinc-500/20", text: "text-zinc-400" };
  }
}

// Format timestamp to relative time
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleString();
}

// Try to format body as JSON
function formatBody(body: string): { formatted: string; isJson: boolean } {
  if (!body) return { formatted: "(empty)", isJson: false };
  try {
    const parsed = JSON.parse(body);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: body, isJson: false };
  }
}

export function WebhookReceiver() {
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(3456);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedNgrok, setCopiedNgrok] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ngrok state
  const [ngrokTunnel, setNgrokTunnel] = useState<NgrokTunnelInfo | null>(null);
  const [ngrokStarting, setNgrokStarting] = useState(false);
  const [ngrokError, setNgrokError] = useState<string | null>(null);

  // Poll ngrok status via Rust backend (avoids CORS issues)
  const checkNgrokStatus = useCallback(async () => {
    try {
      const status = await invoke<NgrokTunnelInfo | null>("get_ngrok_status");
      setNgrokTunnel(status);
      if (status) {
        setNgrokError(null);
      }
    } catch (err) {
      console.error("Failed to check ngrok status:", err);
      setNgrokTunnel(null);
    }
  }, []);

  // Poll ngrok status periodically
  useEffect(() => {
    checkNgrokStatus();
    const interval = setInterval(checkNgrokStatus, 3000);
    return () => clearInterval(interval);
  }, [checkNgrokStatus]);

  const startNgrok = async () => {
    if (!running) {
      setNgrokError("Start the webhook server first");
      return;
    }
    setNgrokStarting(true);
    setNgrokError(null);
    try {
      await invoke("start_ngrok", { port });
      // Wait a moment for ngrok to start, then check status
      setTimeout(checkNgrokStatus, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setNgrokError(errorMsg);
    } finally {
      setNgrokStarting(false);
    }
  };

  const stopNgrok = async () => {
    try {
      await invoke("stop_ngrok");
      setNgrokTunnel(null);
    } catch (err) {
      console.error("Failed to stop ngrok:", err);
    }
  };

  const copyNgrokUrl = async () => {
    if (!ngrokTunnel) return;
    try {
      await navigator.clipboard.writeText(ngrokTunnel.public_url);
      setCopiedNgrok(true);
      setTimeout(() => setCopiedNgrok(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Check server status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await invoke<number | null>("get_webhook_server_status");
        if (status) {
          setRunning(true);
          setPort(status);
          setServerUrl(`http://localhost:${status}`);
          // Load existing events
          const existingEvents = await invoke<WebhookEvent[]>("get_webhook_events");
          setEvents(existingEvents.reverse());
        }
      } catch (err) {
        console.error("Failed to check webhook server status:", err);
      }
    };
    checkStatus();
  }, []);

  // Listen for real-time webhook events
  useEffect(() => {
    const unlisten = listen<WebhookEvent>("webhook-received", (event) => {
      setEvents((prev) => [event.payload, ...prev]);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const startServer = async () => {
    console.log("[WebhookReceiver] Starting server on port:", port);
    setStarting(true);
    setError(null);
    try {
      const url = await invoke<string>("start_webhook_server", { port });
      console.log("[WebhookReceiver] Server started:", url);
      setServerUrl(url);
      setRunning(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[WebhookReceiver] Failed to start webhook server:", errorMsg);
      setError(errorMsg);
    } finally {
      setStarting(false);
    }
  };

  const stopServer = async () => {
    try {
      await invoke("stop_webhook_server");
      setRunning(false);
      setServerUrl(null);
    } catch (err) {
      console.error("Failed to stop webhook server:", err);
    }
  };

  const clearEvents = async () => {
    try {
      await invoke("clear_webhook_events");
      setEvents([]);
      setSelectedId(null);
    } catch (err) {
      console.error("Failed to clear events:", err);
    }
  };

  const copyUrl = async () => {
    if (!serverUrl) return;
    try {
      await navigator.clipboard.writeText(serverUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const selectedEvent = events.find((e) => e.id === selectedId);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20 flex items-center justify-center">
            <Webhook className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Webhook Receiver</h2>
            <p className="text-xs text-muted-foreground">
              {running ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Listening on port {port}
                </span>
              ) : (
                "Local HTTP server for testing"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearEvents}
              className="h-8 gap-2 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
        {/* Port Input */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Port:</span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value) || 3456)}
            disabled={running}
            className="w-20 h-8 px-2 text-sm font-mono bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Start/Stop Server Button */}
        <Button
          size="sm"
          variant={running ? "destructive" : "default"}
          onClick={() => {
            if (running) {
              stopServer();
            } else {
              startServer();
            }
          }}
          disabled={starting}
          className="h-8 gap-2"
        >
          {running ? (
            <>
              <Square className="w-3.5 h-3.5" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              {starting ? "Starting..." : "Start"}
            </>
          )}
        </Button>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* ngrok Controls */}
        {ngrokTunnel ? (
          <>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <code className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-1 rounded">
                {ngrokTunnel.public_url}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyNgrokUrl}
                className="h-7 w-7 p-0"
                title="Copy public URL"
              >
                {copiedNgrok ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 text-purple-400" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {ngrokTunnel.request_count} req
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={stopNgrok}
                className="h-7 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <WifiOff className="w-3 h-3" />
                Stop Tunnel
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={startNgrok}
              disabled={ngrokStarting || !running}
              className="h-8 gap-1.5 border-purple-500/30 text-purple-300 hover:bg-purple-500/10 disabled:opacity-50"
            >
              <Globe className="w-3.5 h-3.5" />
              {ngrokStarting ? "Starting..." : "Public Tunnel"}
            </Button>
          </>
        )}

        {/* Right side - Local URL or errors */}
        <div className="flex items-center gap-2 ml-auto">
          {serverUrl && !ngrokTunnel && (
            <>
              <code className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">
                {serverUrl}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyUrl}
                className="h-8 w-8 p-0"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </>
          )}
          {error && (
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
              {error}
            </span>
          )}
          {ngrokError && (
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
              {ngrokError}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Event List */}
        <div className="w-1/2 border-r border-border overflow-auto">
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Webhook className="w-8 h-8 opacity-30" />
              </div>
              <p className="text-sm font-medium">No requests received</p>
              <p className="text-xs mt-1 opacity-70">
                {running
                  ? "Send a request to see it here"
                  : "Start the server to begin"}
              </p>
              {running && serverUrl && (
                <code className="text-xs font-mono text-muted-foreground mt-4 bg-muted/50 px-3 py-2 rounded-lg">
                  curl -X POST {serverUrl}/webhook
                </code>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  selected={selectedId === event.id}
                  onClick={() =>
                    setSelectedId(selectedId === event.id ? null : event.id)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="w-1/2 overflow-auto bg-muted/10">
          {selectedEvent ? (
            <EventDetail event={selectedEvent} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ExternalLink className="w-8 h-8 opacity-30 mb-3" />
              <p className="text-sm">Select a request to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  selected,
  onClick,
}: {
  event: WebhookEvent;
  selected: boolean;
  onClick: () => void;
}) {
  const methodStyle = getMethodStyle(event.method);
  const hasBody = event.body && event.body.length > 0;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
        selected ? "bg-primary/10" : "hover:bg-muted/30"
      }`}
      onClick={onClick}
    >
      {/* Expand indicator */}
      <div className="w-4 text-muted-foreground">
        {selected ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </div>

      {/* Method badge */}
      <span
        className={`${methodStyle.bg} ${methodStyle.text} text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0`}
      >
        {event.method}
      </span>

      {/* Path */}
      <span className="flex-1 text-sm font-mono truncate" title={event.path}>
        {event.path}
        {event.query && (
          <span className="text-muted-foreground">?{event.query}</span>
        )}
      </span>

      {/* Indicators */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        {hasBody && (
          <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
            {event.body.length}b
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(event.timestamp)}
        </span>
      </div>
    </div>
  );
}

function EventDetail({ event }: { event: WebhookEvent }) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const { formatted: formattedBody, isJson } = formatBody(event.body);

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Request Line */}
      <div className="flex items-center gap-2">
        <span
          className={`${getMethodStyle(event.method).bg} ${getMethodStyle(event.method).text} text-xs font-bold px-2 py-1 rounded uppercase`}
        >
          {event.method}
        </span>
        <code className="text-sm font-mono flex-1 truncate" title={event.path}>
          {event.path}
          {event.query && (
            <span className="text-muted-foreground">?{event.query}</span>
          )}
        </code>
        <span className="text-xs text-muted-foreground">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Headers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Headers
          </h4>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() =>
              copyToClipboard(JSON.stringify(event.headers, null, 2), "headers")
            }
          >
            {copiedSection === "headers" ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </Button>
        </div>
        <div className="bg-background/50 rounded-lg p-3 text-xs font-mono space-y-1 max-h-40 overflow-auto">
          {Object.entries(event.headers).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-cyan-400 shrink-0">{key}:</span>
              <span className="text-foreground truncate" title={value}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Body {isJson && <span className="text-green-400 ml-1">JSON</span>}
          </h4>
          {event.body && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard(event.body, "body")}
            >
              {copiedSection === "body" ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          )}
        </div>
        <pre
          className={`bg-background/50 rounded-lg p-3 text-xs font-mono overflow-auto max-h-64 ${
            !event.body ? "text-muted-foreground italic" : ""
          }`}
        >
          {formattedBody}
        </pre>
      </div>

      {/* Query String (if present) */}
      {event.query && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Query Parameters
          </h4>
          <div className="bg-background/50 rounded-lg p-3 text-xs font-mono space-y-1">
            {event.query.split("&").map((param, i) => {
              const [key, value] = param.split("=");
              return (
                <div key={i} className="flex gap-2">
                  <span className="text-yellow-400">{decodeURIComponent(key)}:</span>
                  <span className="text-foreground">
                    {decodeURIComponent(value || "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
