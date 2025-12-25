import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../stores/app-store";

interface LogEvent {
  path: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

export function useLogStream() {
  const appendLog = useAppStore((state) => state.appendLog);

  useEffect(() => {
    const unlisten = listen<LogEvent>("process-log", (event) => {
      appendLog(event.payload.path, {
        timestamp: new Date(),
        level: event.payload.level as "info" | "warn" | "error" | "debug",
        message: event.payload.message,
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendLog]);
}
