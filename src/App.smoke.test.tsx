import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./TerminalPanel", () => ({
  TerminalPanel: () => <div data-testid="terminal-panel" />, 
}));

vi.mock("./PermissionBar", () => ({
  PermissionBar: () => <div data-testid="permission-bar" />,
}));

import App from "./App";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("App smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("covers create session, send/abort prompt, and restart server", async () => {
    const user = userEvent.setup();

    const electron = {
      kilo: {
        getCliInfo: vi.fn().mockResolvedValue({ installed: true, version: "1.2.3" }),
        getHomeDirectory: vi.fn().mockResolvedValue("/tmp/project"),
        startServer: vi.fn().mockResolvedValue({ managed: true, running: true, port: 4100, url: "http://127.0.0.1:4100" }),
        stopServer: vi.fn().mockResolvedValue({ managed: false, running: false, port: 4100, url: "http://127.0.0.1:4100" }),
        getServerState: vi.fn().mockResolvedValue({ managed: true, running: true, port: 4100, url: "http://127.0.0.1:4100" }),
      },
      shell: {
        openExternal: vi.fn().mockResolvedValue(undefined),
      },
      dialog: {
        openDirectory: vi.fn().mockResolvedValue(["/tmp/project"]),
      },
      diagnostics: {
        collect: vi.fn().mockResolvedValue({ id: "diag-1" }),
        exportZip: vi.fn().mockResolvedValue({ id: "diag-1", filePath: "/tmp/diag.zip" }),
        openFolder: vi.fn().mockResolvedValue(undefined),
      },
      terminal: {
        create: vi.fn().mockResolvedValue(1),
        write: vi.fn().mockResolvedValue(undefined),
        resize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        onData: vi.fn().mockReturnValue(() => {}),
        onExit: vi.fn().mockReturnValue(() => {}),
      },
    };

    Object.defineProperty(window, "electron", {
      value: electron,
      configurable: true,
    });

    let sessions = [
      {
        id: "session-1",
        projectID: "project-1",
        directory: "/tmp/project",
        title: "New session",
        version: "1",
        time: { created: Date.now(), updated: Date.now() },
      },
    ];

    const promptState: { resolve: null | (() => void) } = { resolve: null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url.includes("/global/health")) return jsonResponse({ healthy: true, version: "1.0.0" });
      if (url.includes("/config/providers")) return jsonResponse({ providers: [], default: {} });
      if (url.endsWith("/agent")) return jsonResponse([]);
      if (url.includes("/session/status")) return jsonResponse({});
      if (url.includes("/session?") && method === "GET") return jsonResponse(sessions);
      if (url.endsWith("/session") && method === "POST") {
        const next = {
          id: `session-${sessions.length + 1}`,
          projectID: "project-1",
          directory: "/tmp/project",
          title: "New session",
          version: "1",
          time: { created: Date.now(), updated: Date.now() },
        };
        sessions = [next, ...sessions];
        return jsonResponse(next);
      }

      if (url.match(/\/session\/[^/]+\/message$/) && method === "GET") {
        return jsonResponse([]);
      }

      if (url.match(/\/session\/[^/]+\/message$/) && method === "POST") {
        return new Promise((resolve) => {
          promptState.resolve = () => resolve(jsonResponse({ info: {}, parts: [] }));
        });
      }

      if (url.match(/\/session\/[^/]+\/abort$/) && method === "POST") {
        return jsonResponse(true);
      }

      return jsonResponse({});
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(electron.kilo.getCliInfo).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new session/i }));

    const composer = screen.getByPlaceholderText(/ask kilo to build/i);
    await user.type(composer, "Run tests");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /stop/i }));

    if (promptState.resolve) {
      promptState.resolve();
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/session\/.*\/abort$/),
        expect.objectContaining({ method: "POST" }),
      );
    });

    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("button", { name: /restart server/i }));

    expect(electron.kilo.stopServer).toHaveBeenCalled();
    expect(electron.kilo.startServer).toHaveBeenCalled();
  });
});
