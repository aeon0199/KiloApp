import { useSSE } from "./hooks";

type StatusBarProps = {
  title: string;
  healthText: string;
  isOnline: boolean;
  agentName: string;
  modelName: string;
  connectionState: string;
};

export function StatusBar({ title, healthText, isOnline, agentName, modelName, connectionState }: StatusBarProps) {
  const sse = useSSE();
  const sseLabel = sse.status === "connected" ? "live" : sse.status === "connecting" ? "connecting" : "polling";
  const connectionLabel = connectionState.replace(/_/g, " ");

  return (
    <header className="main-topbar">
      <div className="main-topbar-left">
        <span className="kilo-wordmark">KILO</span>
        <span className="topbar-title">{title}</span>
      </div>
      <div className="main-topbar-right">
        <span className={`health ${isOnline ? "good" : "bad"}`}>
          <span className="health-dot" />
          {healthText}
        </span>
        <span className={`connection-pill ${connectionState}`}>{connectionLabel}</span>
        <span className={`sse-pill ${sse.status}`}>{sseLabel}</span>
        <span className="agent-pill">{agentName || "code"}</span>
        <span className="model-pill">{modelName}</span>
      </div>
    </header>
  );
}
