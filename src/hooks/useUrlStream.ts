import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../stores/app-store";

interface UrlEvent {
  path: string;
  url: string;
  port: number;
}

export function useUrlStream() {
  const updateProjectUrl = useAppStore((state) => state.updateProjectUrl);

  useEffect(() => {
    const unlisten = listen<UrlEvent>("process-url", (event) => {
      updateProjectUrl(
        event.payload.path,
        event.payload.url,
        event.payload.port
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateProjectUrl]);
}
