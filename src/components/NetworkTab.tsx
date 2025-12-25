import { WebhookReceiver } from "./WebhookReceiver";

export function NetworkTab() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WebhookReceiver />
    </div>
  );
}
