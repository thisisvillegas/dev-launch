import { Button } from "./ui/button";
import { AlertTriangle } from "lucide-react";

interface QuitDialogProps {
  open: boolean;
  runningCount: number;
  onStopAll: () => void;
  onKeepRunning: () => void;
  onCancel: () => void;
}

export function QuitDialog({
  open,
  runningCount,
  onStopAll,
  onKeepRunning,
  onCancel,
}: QuitDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">
              {runningCount} server{runningCount !== 1 ? "s" : ""} still running
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              What would you like to do with your running dev servers?
            </p>

            <div className="flex flex-col gap-2">
              <Button
                onClick={onStopAll}
                variant="destructive"
                className="w-full justify-start"
              >
                Stop all servers and quit
              </Button>
              <Button
                onClick={onKeepRunning}
                variant="secondary"
                className="w-full justify-start"
              >
                Keep servers running and quit
              </Button>
              <Button
                onClick={onCancel}
                variant="ghost"
                className="w-full justify-start"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
