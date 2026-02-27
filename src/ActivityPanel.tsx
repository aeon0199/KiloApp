import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Terminal,
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  Loader,
} from "lucide-react";
import type { MessageWithParts, ToolPart, ToolActivity } from "./types";
import { DiffView } from "./DiffView";

type ActivityPanelProps = {
  messages: MessageWithParts[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  height: number;
  onResize: (height: number) => void;
};

function extractActivities(messages: MessageWithParts[]): ToolActivity[] {
  const items: ToolActivity[] = [];
  for (const msg of messages) {
    for (let i = 0; i < msg.parts.length; i++) {
      const part = msg.parts[i];
      if (part.type !== "tool") continue;
      const tp = part as ToolPart;
      const state = tp.state || {};
      items.push({
        id: `${msg.info.id}-${i}`,
        tool: tp.tool || "unknown",
        status: String(state.status || "running"),
        input: state.input as Record<string, unknown> | undefined,
        output: typeof state.output === "string" ? state.output : undefined,
        metadata: state.metadata as Record<string, unknown> | undefined,
      });
    }
  }
  return items;
}

const BASH_TOOLS = ["bash", "shell", "command"];
const FILE_TOOLS = ["read", "write", "edit", "file"];
const SEARCH_TOOLS = ["grep", "search", "glob"];

function toolIcon(tool: string) {
  const t = tool.toLowerCase();
  if (BASH_TOOLS.includes(t)) return <Terminal size={12} />;
  if (FILE_TOOLS.includes(t)) return <FileText size={12} />;
  if (SEARCH_TOOLS.includes(t)) return <Search size={12} />;
  return <Terminal size={12} />;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <Check size={10} className="activity-status completed" />;
    case "error":
    case "failed":
      return <AlertCircle size={10} className="activity-status error" />;
    default:
      return <Loader size={10} className="activity-status running" />;
  }
}

function entryLabel(activity: ToolActivity): string {
  const input = activity.input;
  if (!input) return activity.tool;

  if (BASH_TOOLS.includes(activity.tool.toLowerCase())) {
    return String(input.command || input.description || activity.tool);
  }

  if (input.path) {
    const action = activity.tool === "write" ? "Write" : activity.tool === "edit" ? "Edit" : "Read";
    return `${action} ${String(input.path)}`;
  }

  if (input.pattern) {
    return `Search: ${String(input.pattern)}`;
  }

  return activity.tool;
}

export function ActivityPanel({ messages, collapsed, onToggleCollapse, height, onResize }: ActivityPanelProps) {
  const activities = useMemo(() => extractActivities(messages), [messages]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // Auto-scroll on new entries
  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length, collapsed]);

  // Resize drag
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        onResize(Math.max(80, Math.min(600, dragRef.current.startH + delta)));
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [height, onResize],
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered =
    filter === "all"
      ? activities
      : activities.filter((a) => {
          const t = a.tool.toLowerCase();
          if (filter === "bash") return BASH_TOOLS.includes(t);
          if (filter === "file") return FILE_TOOLS.includes(t);
          if (filter === "search") return SEARCH_TOOLS.includes(t);
          return true;
        });

  if (activities.length === 0) return null;

  return (
    <div className="activity-panel" style={collapsed ? undefined : { height }}>
      {!collapsed && <div className="activity-handle" onMouseDown={onMouseDown} />}
      <div className="activity-header">
        <button type="button" className="activity-toggle" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <Terminal size={13} />
          <span>Activity</span>
          <span className="activity-count">{activities.length}</span>
        </button>
        {!collapsed && (
          <div className="activity-filters">
            {["all", "bash", "file", "search"].map((f) => (
              <button
                key={f}
                type="button"
                className={`activity-filter ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="activity-entries" ref={scrollRef}>
          {filtered.map((activity) => {
            const expanded = expandedIds.has(activity.id);
            const isBash = BASH_TOOLS.includes(activity.tool.toLowerCase());
            const isFileEdit = ["write", "edit"].includes(activity.tool.toLowerCase());
            const hasOutput = !!activity.output;

            return (
              <div key={activity.id} className={`activity-entry ${activity.status}`}>
                <div
                  className="activity-entry-header"
                  onClick={() => hasOutput && toggleExpand(activity.id)}
                  style={{ cursor: hasOutput ? "pointer" : "default" }}
                >
                  {statusIcon(activity.status)}
                  {toolIcon(activity.tool)}
                  <span className={`activity-entry-label ${isBash ? "bash" : ""}`}>
                    {isBash ? "$ " : ""}
                    {entryLabel(activity)}
                  </span>
                  {hasOutput && (
                    <span className="activity-entry-expand">
                      {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </span>
                  )}
                </div>
                {expanded && hasOutput && (
                  <div className="activity-entry-output">
                    {isFileEdit && activity.output ? (
                      <DiffView content={activity.output} path={String(activity.input?.path || "")} />
                    ) : (
                      <pre>{activity.output}</pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
