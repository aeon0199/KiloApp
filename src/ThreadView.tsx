import { Send, Sparkles } from "lucide-react";
import type { MessageWithParts } from "./types";
import { MessageBubble } from "./MessageBubble";
import { ActivityPanel } from "./ActivityPanel";
import { pathName } from "./utils";

type ThreadViewProps = {
  messages: MessageWithParts[];
  loadingMessages: boolean;
  busy: boolean;
  showHome: boolean;
  selectedWorkspace: string;
  activityCollapsed: boolean;
  activityHeight: number;
  onToggleActivity: () => void;
  onResizeActivity: (height: number) => void;
};

export function ThreadView({
  messages,
  loadingMessages,
  busy,
  showHome,
  selectedWorkspace,
  activityCollapsed,
  activityHeight,
  onToggleActivity,
  onResizeActivity,
}: ThreadViewProps) {
  if (showHome) {
    return (
      <div className="home-hero">
        <Sparkles size={48} className="home-hero-icon" />
        <h1 className="home-hero-title">Let's build</h1>
        <p className="home-hero-subtitle">
          {selectedWorkspace ? pathName(selectedWorkspace) : "Add a project to get started"}
        </p>
      </div>
    );
  }

  return (
    <div className="thread-split">
      <section className="messages">
        {loadingMessages && (
          <div className="working">
            <span className="working-spinner" />
            <span className="working-text">Updating...</span>
          </div>
        )}

        {messages.length === 0 && !loadingMessages && (
          <div className="empty-state">
            <Send size={28} />
            <h3>Thread is ready</h3>
            <p>Describe what you want to build.</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.info.id} message={message} />
        ))}

        {busy && (
          <div className="working">
            <span className="working-spinner" />
            <span className="working-text">Kilo is working...</span>
          </div>
        )}
      </section>

      <ActivityPanel
        messages={messages}
        collapsed={activityCollapsed}
        onToggleCollapse={onToggleActivity}
        height={activityHeight}
        onResize={onResizeActivity}
      />
    </div>
  );
}
