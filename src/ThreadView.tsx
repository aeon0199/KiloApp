import { useEffect, useRef } from "react";
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
  onUseQuickReply: (value: string) => void;
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
  onUseQuickReply,
}: ThreadViewProps) {
  const messagesRef = useRef<HTMLElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldStickRef = useRef(true);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    const nearBottomThreshold = 120;
    const isNearBottom = () =>
      container.scrollHeight - container.scrollTop - container.clientHeight <= nearBottomThreshold;

    // Initialize stickiness on mount.
    shouldStickRef.current = isNearBottom();

    function onScroll() {
      shouldStickRef.current = isNearBottom();
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (showHome) return;
    const container = messagesRef.current;
    if (!container) return;
    if (!shouldStickRef.current) return;
    requestAnimationFrame(() => {
      const target = bottomRef.current;
      if (!target || typeof target.scrollIntoView !== "function") return;
      target.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [messages.length, busy, loadingMessages, showHome]);

  if (showHome) {
    return (
      <div className="home-hero">
        <Sparkles size={48} className="home-hero-icon" />
        <h1 className="home-hero-title">Welcome to Kilo</h1>
        <p className="home-hero-subtitle">
          {selectedWorkspace ? `Project: ${pathName(selectedWorkspace)}` : "Add a project to get started"}
        </p>
      </div>
    );
  }

  return (
    <div className="thread-split">
      <section className="messages" ref={messagesRef}>
        {loadingMessages && (
          <div className="working">
            <span className="working-spinner" />
            <span className="working-text">Updating...</span>
          </div>
        )}

        {messages.length === 0 && !loadingMessages && (
          <div className="empty-state">
            <Send size={28} />
            <h3>Ready for instructions</h3>
            <p>Describe what you want Kilo to build, fix, or ship.</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.info.id} message={message} onUseQuickReply={onUseQuickReply} />
        ))}

        {busy && (
          <div className="working">
            <span className="working-spinner" />
            <span className="working-text">Kilo is working...</span>
          </div>
        )}

        <div ref={bottomRef} />
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
