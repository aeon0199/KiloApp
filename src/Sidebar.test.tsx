import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { SessionInfo } from "./types";

function makeSession(id: string, title: string): SessionInfo {
  return {
    id,
    title,
    projectID: "project-1",
    directory: "/tmp/project",
    version: "1",
    time: {
      created: Date.now(),
      updated: Date.now(),
    },
  };
}

describe("Sidebar", () => {
  it("calls create session and settings actions", async () => {
    const user = userEvent.setup();
    const onCreateThread = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <Sidebar
        activeTab="threads"
        onTabChange={vi.fn()}
        workspaces={["/tmp/project"]}
        selectedWorkspace="/tmp/project"
        sessions={[makeSession("s1", "Session 1")]}
        selectedSessionID="s1"
        collapsedWorkspaces={new Set()}
        loadingSessions={false}
        sessionsByWorkspace={new Map([["/tmp/project", [makeSession("s1", "Session 1")]]])}
        onCreateThread={onCreateThread}
        onAddWorkspace={vi.fn()}
        onRemoveWorkspace={vi.fn()}
        onToggleCollapse={vi.fn()}
        onSelectWorkspace={vi.fn()}
        onSelectSession={vi.fn()}
        onRefreshSessions={vi.fn()}
        onOpenSettings={onOpenSettings}
        onRenameSession={vi.fn()}
        onForkSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onCompactSession={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new session/i }));
    await user.click(screen.getByRole("button", { name: /settings/i }));

    expect(onCreateThread).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
