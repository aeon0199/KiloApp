import { useState } from "react";
import {
  Plus,
  RefreshCw,
  X,
  FolderPlus,
  ChevronRight,
  Settings,
  MessageSquare,
  Cloud,
  Bot,
  Pencil,
  GitBranch,
  Minimize2,
  Trash2,
} from "lucide-react";
import type { SessionInfo } from "./types";
import { pathName, relativeTime } from "./utils";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

export type SidebarTab = "threads" | "cloud" | "agents";

type SidebarProps = {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  workspaces: string[];
  selectedWorkspace: string;
  sessions: SessionInfo[];
  selectedSessionID: string;
  collapsedWorkspaces: Set<string>;
  loadingSessions: boolean;
  sessionsByWorkspace: Map<string, SessionInfo[]>;
  onCreateThread: () => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onToggleCollapse: (path: string) => void;
  onSelectWorkspace: (path: string) => void;
  onSelectSession: (id: string) => void;
  onRefreshSessions: () => void;
  onOpenSettings: () => void;
  onRenameSession: (id: string, title: string) => void;
  onForkSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onCompactSession: (id: string) => void;
  startDrag: (e: React.MouseEvent) => void;
};

export function Sidebar({
  activeTab,
  onTabChange,
  workspaces,
  selectedWorkspace,
  sessions,
  selectedSessionID,
  collapsedWorkspaces,
  loadingSessions,
  sessionsByWorkspace,
  onCreateThread,
  onAddWorkspace,
  onRemoveWorkspace,
  onToggleCollapse,
  onSelectWorkspace,
  onSelectSession,
  onRefreshSessions,
  onOpenSettings,
  onRenameSession,
  onForkSession,
  onDeleteSession,
  onCompactSession,
  startDrag,
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function handleContextMenu(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  }

  function startRename(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    setRenamingId(sessionId);
    setRenameValue(session?.title || "");
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        { label: "Rename", icon: <Pencil size={12} />, onClick: () => startRename(contextMenu.sessionId) },
        { label: "Fork", icon: <GitBranch size={12} />, onClick: () => onForkSession(contextMenu.sessionId) },
        { label: "Compact", icon: <Minimize2 size={12} />, onClick: () => onCompactSession(contextMenu.sessionId) },
        { label: "Delete", icon: <Trash2 size={12} />, danger: true, onClick: () => onDeleteSession(contextMenu.sessionId) },
      ]
    : [];

  return (
    <aside className="sidebar">
      <div className="sidebar-drag-region" onMouseDown={startDrag} />

      <button className="new-thread" onClick={onCreateThread}>
        <Plus size={14} />
        New thread
      </button>

      {/* Navigation tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === "threads" ? "active" : ""}`}
          onClick={() => onTabChange("threads")}
        >
          <MessageSquare size={13} />
          Threads
        </button>
        <button
          className={`sidebar-tab ${activeTab === "cloud" ? "active" : ""}`}
          onClick={() => onTabChange("cloud")}
        >
          <Cloud size={13} />
          Cloud
        </button>
        <button
          className={`sidebar-tab ${activeTab === "agents" ? "active" : ""}`}
          onClick={() => onTabChange("agents")}
        >
          <Bot size={13} />
          Agents
        </button>
      </div>

      {/* Threads tab content */}
      {activeTab === "threads" && (
        <>
          <div className="sidebar-section-header">
            <h2>Threads</h2>
            <div className="sidebar-section-actions">
              <button className="icon-button" onClick={onAddWorkspace} aria-label="Add project">
                <FolderPlus size={14} />
              </button>
              <button className="icon-button" onClick={onRefreshSessions} aria-label="Refresh">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="sidebar-body">
            {workspaces.length === 0 && (
              <div className="sidebar-empty">
                <p>No projects yet</p>
                <button className="sidebar-empty-add" onClick={onAddWorkspace}>
                  <FolderPlus size={14} />
                  Add a project folder
                </button>
              </div>
            )}

            {workspaces.map((ws) => {
              const isCollapsed = collapsedWorkspaces.has(ws);
              const isActive = ws === selectedWorkspace;
              const threads = isActive ? sessions : (sessionsByWorkspace.get(ws) ?? []);

              return (
                <div key={ws} className="workspace-group">
                  <div className={`workspace-group-header ${isActive ? "active" : ""}`}>
                    <button
                      className="workspace-group-toggle"
                      onClick={() => {
                        onSelectWorkspace(ws);
                        onToggleCollapse(ws);
                      }}
                    >
                      <ChevronRight size={12} className={`workspace-chevron ${isCollapsed ? "" : "expanded"}`} />
                      <span className="workspace-group-name">{pathName(ws)}</span>
                    </button>
                    <button
                      className="workspace-group-remove"
                      onClick={() => onRemoveWorkspace(ws)}
                      aria-label={`Remove ${ws}`}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {!isCollapsed && isActive && (
                    <div className="workspace-threads">
                      {loadingSessions && <p className="muted">Loading...</p>}
                      {!loadingSessions && threads.length === 0 && (
                        <p className="muted">No threads yet</p>
                      )}
                      {threads.map((session) => (
                        <button
                          key={session.id}
                          className={`thread-item ${session.id === selectedSessionID ? "active" : ""}`}
                          onClick={() => onSelectSession(session.id)}
                          onContextMenu={(e) => handleContextMenu(e, session.id)}
                        >
                          {renamingId === session.id ? (
                            <input
                              className="thread-rename-input"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") cancelRename();
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <>
                              <span>{session.title || "Untitled thread"}</span>
                              <small>{relativeTime(session.time.updated)}</small>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Cloud + Agents tabs show placeholder — content renders in main area */}
      {activeTab === "cloud" && (
        <div className="sidebar-body">
          <div className="sidebar-tab-hint">
            <Cloud size={20} />
            <p>Cloud sessions from other devices</p>
          </div>
        </div>
      )}

      {activeTab === "agents" && (
        <div className="sidebar-body">
          <div className="sidebar-tab-hint">
            <Bot size={20} />
            <p>Configured agents and tools</p>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <button className="sidebar-footer-button" onClick={onOpenSettings}>
          <Settings size={14} />
          Settings
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}
