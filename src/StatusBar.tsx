import { useSSE } from "./hooks";

type StatusBarProps = {
  title: string;
  healthText: string;
  isOnline: boolean;
  modelName: string;
  startDrag: (e: React.MouseEvent) => void;
};

export function StatusBar({ title, healthText, isOnline, modelName, startDrag }: StatusBarProps) {
  const sse = useSSE();
  const sseLabel = sse.status === "connected" ? "live" : sse.status === "connecting" ? "connecting" : "polling";

  return (
    <header className="main-topbar" onMouseDown={startDrag}>
      <div className="main-topbar-left">
        <span className="topbar-title">{title}</span>
      </div>
      <div className="main-topbar-right">
        <span className={`health ${isOnline ? "good" : "bad"}`}>
          <span className="health-dot" />
          {healthText}
        </span>
        <span className={`sse-pill ${sse.status}`}>{sseLabel}</span>
        <span className="model-pill">{modelName}</span>
      </div>
    </header>
  );
}
