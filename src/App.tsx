import { FormEvent, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AlertCircle, AlertTriangle, Bug, ExternalLink, FolderPlus, RefreshCw, Wifi, X } from "lucide-react";
import { KiloApi } from "./api";
import type {
  Agent,
  AgentModelMemory,
  AgentRuntimeState,
  AppHealthState,
  AppSettingsV1,
  DiagnosticSnapshot,
  KiloCliInfo,
  KiloServerState,
  MessageWithParts,
  ProviderListResponse,
  SessionInfo,
  ThreadRuntimeState,
  UiDensity,
  UiMotion,
  UiPreferencesV1,
  UiThemeVariant,
} from "./types";
import { currentModel, defaultAgentName, firstAvailableModel, modelExists, runtimeCompatibility, runtimeModelName } from "./utils";
import { useSSEConnection, SSEContext } from "./hooks";
import { Sidebar, type SidebarTab } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { ThreadView } from "./ThreadView";
import { Composer } from "./Composer";
import { SettingsModal } from "./SettingsModal";
import { PermissionBar } from "./PermissionBar";
import { CloudSessions } from "./CloudSessions";
import { AgentsView } from "./AgentsView";
import { TerminalPanel } from "./TerminalPanel";
import { PanelSplitter } from "./PanelSplitter";
import { mapError, type AppErrorInfo } from "./errors";
import { DEFAULT_UI_PREFERENCES, readSettings, writeSettings } from "./settings";
import "./App.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/motion.css";

// Helper to log to both console and terminal
function debugLog(...args: unknown[]) {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log('[DEBUG]', message);
  window.electron?.debug?.log(message);
}

const STORAGE_WORKSPACES = "kiloapp.workspaces";
const STORAGE_WORKSPACE = "kiloapp.selectedWorkspace";
const STORAGE_COLLAPSED = "kiloapp.collapsedWorkspaces";
const STORAGE_TERMINAL_HEIGHT = "kiloapp.terminalHeight";
const STORAGE_THREAD_RUNTIME = "kiloapp.thread-runtime.v1";
const STORAGE_AGENT_MODEL_MEMORY = "kiloapp.agent-model-memory.v1";
const STORAGE_DEFAULT_AGENT = "kiloapp.default-agent.v1";
const STORAGE_UI_PREFERENCES = "kiloapp.ui.preferences.v1";
const STORAGE_UI_THEME_VARIANT = "kiloapp.ui.theme-variant.v1";
const DEFAULT_PORT = 4100;

function readString(key: string, fallback: string) {
  return localStorage.getItem(key) ?? fallback;
}

function readStringList(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseThemeVariant(value: unknown): UiThemeVariant {
  return value === "industrial_neon_v2" ? "industrial_neon_v2" : "classic";
}

function parseDensity(value: unknown): UiDensity {
  return value === "compact" ? "compact" : "comfortable";
}

function parseMotion(value: unknown): UiMotion {
  return value === "reduced" ? "reduced" : "full";
}

function readUiPreferences(settings: AppSettingsV1): UiPreferencesV1 {
  const raw = localStorage.getItem(STORAGE_UI_PREFERENCES);
  const fallback = settings.ui || DEFAULT_UI_PREFERENCES;
  if (!raw) {
    const override = localStorage.getItem(STORAGE_UI_THEME_VARIANT);
    if (!override) return fallback;
    return {
      ...fallback,
      themeVariant: parseThemeVariant(override),
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<UiPreferencesV1>;
    const themeVariant = parseThemeVariant(parsed.themeVariant ?? localStorage.getItem(STORAGE_UI_THEME_VARIANT));
    return {
      schemaVersion: 1,
      themeVariant,
      density: parseDensity(parsed.density),
      motion: parseMotion(parsed.motion),
    };
  } catch {
    return fallback;
  }
}

function isSameUiPreferences(a: UiPreferencesV1, b: UiPreferencesV1): boolean {
  return a.themeVariant === b.themeVariant && a.density === b.density && a.motion === b.motion;
}

function readThreadRuntime(): ThreadRuntimeState {
  const raw = localStorage.getItem(STORAGE_THREAD_RUNTIME);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: ThreadRuntimeState = {};
    for (const [sessionID, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof sessionID !== "string" || !value || typeof value !== "object") continue;
      const input = value as Record<string, unknown>;
      if (typeof input.agentName !== "string") continue;
      if (typeof input.providerID !== "string") continue;
      if (typeof input.modelID !== "string") continue;
      result[sessionID] = {
        agentName: input.agentName,
        providerID: input.providerID,
        modelID: input.modelID,
        updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
      };
    }
    return result;
  } catch {
    return {};
  }
}

function readAgentModelMemory(): AgentModelMemory {
  const raw = localStorage.getItem(STORAGE_AGENT_MODEL_MEMORY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: AgentModelMemory = {};
    for (const [agentName, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof agentName !== "string" || !value || typeof value !== "object") continue;
      const input = value as Record<string, unknown>;
      if (typeof input.providerID !== "string") continue;
      if (typeof input.modelID !== "string") continue;
      result[agentName] = {
        providerID: input.providerID,
        modelID: input.modelID,
        updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
      };
    }
    return result;
  } catch {
    return {};
  }
}

function isMissingWorkspaceError(reason: unknown): boolean {
  const lower = String(reason).toLowerCase();
  return lower.includes("enoent") || lower.includes("no such file") || lower.includes("not found");
}

function App() {
  const [cliInfo, setCliInfo] = useState<KiloCliInfo>({ installed: false });
  const [, setServerState] = useState<KiloServerState>({ managed: false, running: false, port: DEFAULT_PORT, url: `http://127.0.0.1:${DEFAULT_PORT}` });
  const serverUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
  const [health, setHealth] = useState<AppHealthState>({ state: "booting", text: "Booting KiloApp..." });
  const [settings, setSettings] = useState<AppSettingsV1>(() => readSettings());
  const [uiPreferences, setUiPreferences] = useState<UiPreferencesV1>(() => readUiPreferences(readSettings()));
  const [workspaces, setWorkspaces] = useState<string[]>(readStringList(STORAGE_WORKSPACES));
  const [selectedWorkspace, setSelectedWorkspace] = useState(() => readString(STORAGE_WORKSPACE, readSettings().lastWorkspace));
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionID, setSelectedSessionID] = useState("");
  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [providers, setProviders] = useState<ProviderListResponse | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState("");
  const [threadRuntime, setThreadRuntime] = useState<ThreadRuntimeState>(() => readThreadRuntime());
  const [agentModelMemory, setAgentModelMemory] = useState<AgentModelMemory>(() => readAgentModelMemory());
  const [defaultAgent, setDefaultAgent] = useState(() => readString(STORAGE_DEFAULT_AGENT, "code"));
  const [draftRuntime, setDraftRuntime] = useState<AgentRuntimeState | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [lastRuntimeError, setLastRuntimeError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorInfo, setErrorInfo] = useState<AppErrorInfo | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("threads");
  const [diagnosticsID, setDiagnosticsID] = useState("");
  const [diagnosticsPath, setDiagnosticsPath] = useState("");
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_COLLAPSED);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [activityHeight, setActivityHeight] = useState(200);
  const [terminalHeight, setTerminalHeight] = useState(() => {
    const saved = localStorage.getItem(STORAGE_TERMINAL_HEIGHT);
    return saved ? parseInt(saved, 10) : 250;
  });
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  const selectedSession = sessions.find((session) => session.id === selectedSessionID);
  const api = useMemo(() => new KiloApi(serverUrl), [serverUrl]);
  const sse = useSSEConnection(serverUrl);
  const isOnline = health.state === "healthy" || sse.status === "connected";
  const showHome = !selectedSessionID;
  const showOnboarding = !selectedWorkspace || !cliInfo.installed || health.state === "degraded";
  const themeClass = uiPreferences.themeVariant === "industrial_neon_v2" ? "ui-theme-industrial-neon-v2" : "ui-theme-classic";
  const densityClass = uiPreferences.density === "compact" ? "ui-density-compact" : "ui-density-comfortable";
  const motionClass = uiPreferences.motion === "reduced" ? "ui-motion-reduced" : "ui-motion-full";

  const refreshRef = useRef({ refreshSessions: () => {}, refreshMessages: () => {}, refreshProviders: () => {}, refreshAgents: () => {} });

  const sessionsByWorkspace = useMemo(() => {
    const map = new Map<string, SessionInfo[]>(
      workspaces.map((workspace) => [workspace, [] as SessionInfo[]]),
    );
    for (const session of sessions) {
      const workspace = session.directory || selectedWorkspace;
      if (!workspace) continue;
      const existing = map.get(workspace);
      if (existing) {
        existing.push(session);
        continue;
      }
      map.set(workspace, [session]);
    }
    return map;
  }, [sessions, workspaces, selectedWorkspace]);

  const fallbackModel = useMemo(() => {
    const current = currentModel(providers);
    if (current) return current;
    return firstAvailableModel(providers);
  }, [providers]);

  const resolveAgentName = useCallback(
    (requested?: string) => defaultAgentName(agents, requested || defaultAgent || "code"),
    [agents, defaultAgent],
  );

  const resolveRuntime = useCallback(
    (source: AgentRuntimeState | null): { runtime: AgentRuntimeState; warning: string | null } => {
      const agentName = resolveAgentName(source?.agentName);
      const memory = agentModelMemory[agentName];
      let providerID = source?.providerID || "";
      let modelID = source?.modelID || "";
      let warning: string | null = null;
      const canValidateModel = !!providers;

      if (canValidateModel && !modelExists(providers, providerID, modelID)) {
        if (providerID || modelID) {
          warning = "Selected model is unavailable. KiloApp switched to a compatible model.";
        }
        providerID = "";
        modelID = "";
      }

      if ((!providerID || !modelID) && memory && modelExists(providers, memory.providerID, memory.modelID)) {
        providerID = memory.providerID;
        modelID = memory.modelID;
      }

      if ((!providerID || !modelID) && fallbackModel) {
        providerID = fallbackModel.providerID;
        modelID = fallbackModel.modelID;
      }

      return {
        runtime: {
          agentName,
          providerID,
          modelID,
          updatedAt: source?.updatedAt ?? Date.now(),
        },
        warning,
      };
    },
    [agentModelMemory, fallbackModel, providers, resolveAgentName],
  );

  const activeRuntimeSource = selectedSessionID ? threadRuntime[selectedSessionID] ?? null : draftRuntime;
  const activeRuntimeResolution = useMemo(() => resolveRuntime(activeRuntimeSource), [activeRuntimeSource, resolveRuntime]);
  const activeRuntime = activeRuntimeResolution.runtime;
  const activeModelName = runtimeModelName(providers, activeRuntime);
  const compatibility = runtimeCompatibility(agents, providers, activeRuntime);

  const setErrorFromReason = useCallback((reason: unknown) => {
    const mapped = mapError(reason);
    setErrorInfo(mapped);
    setHealth((current) => {
      if (current.state === "healthy") {
        return {
          state: "degraded",
          text: mapped.message,
          category: mapped.category,
        };
      }
      return {
        ...current,
        category: mapped.category,
      };
    });
  }, []);

  const clearError = useCallback(() => {
    setErrorInfo(null);
  }, []);

  const onRuntimeFallback = useCallback((message: string) => {
    setRuntimeNotice(message);
    setLastRuntimeError(message);
  }, []);

  const updateUiPreferences = useCallback((partial: Partial<UiPreferencesV1>) => {
    setUiPreferences((current) => ({
      ...current,
      ...partial,
      schemaVersion: 1,
    }));
  }, []);

  const resetUiAppearance = useCallback(() => {
    setUiPreferences(DEFAULT_UI_PREFERENCES);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_WORKSPACES, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem(STORAGE_WORKSPACE, selectedWorkspace);
  }, [selectedWorkspace]);

  useEffect(() => {
    localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify([...collapsedWorkspaces]));
  }, [collapsedWorkspaces]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TERMINAL_HEIGHT, String(terminalHeight));
  }, [terminalHeight]);

  useEffect(() => {
    localStorage.setItem(STORAGE_THREAD_RUNTIME, JSON.stringify(threadRuntime));
  }, [threadRuntime]);

  useEffect(() => {
    localStorage.setItem(STORAGE_AGENT_MODEL_MEMORY, JSON.stringify(agentModelMemory));
  }, [agentModelMemory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_DEFAULT_AGENT, defaultAgent);
  }, [defaultAgent]);

  useEffect(() => {
    localStorage.setItem(STORAGE_UI_PREFERENCES, JSON.stringify(uiPreferences));
    localStorage.setItem(STORAGE_UI_THEME_VARIANT, uiPreferences.themeVariant);
  }, [uiPreferences]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.dataset.kiloTheme = uiPreferences.themeVariant;
    root.dataset.kiloDensity = uiPreferences.density;
    root.dataset.kiloMotion = uiPreferences.motion;
    body.classList.toggle("kilo-theme-industrial-neon-v2", uiPreferences.themeVariant === "industrial_neon_v2");
    return () => {
      delete root.dataset.kiloTheme;
      delete root.dataset.kiloDensity;
      delete root.dataset.kiloMotion;
      body.classList.remove("kilo-theme-industrial-neon-v2");
    };
  }, [uiPreferences]);

  useEffect(() => {
    setSettings((current) => {
      if (current.lastWorkspace === selectedWorkspace) return current;
      return { ...current, lastWorkspace: selectedWorkspace };
    });
  }, [selectedWorkspace]);

  useEffect(() => {
    setSettings((current) => {
      if (isSameUiPreferences(current.ui, uiPreferences)) return current;
      return { ...current, ui: uiPreferences };
    });
  }, [uiPreferences]);

  useEffect(() => {
    writeSettings(settings);
  }, [settings]);

  useEffect(() => {
    setThreadRuntime((previous) => {
      const validSessionIDs = new Set(sessions.map((session) => session.id));
      const next: ThreadRuntimeState = {};
      let changed = false;
      for (const [sessionID, runtime] of Object.entries(previous)) {
        if (!validSessionIDs.has(sessionID)) {
          changed = true;
          continue;
        }
        next[sessionID] = runtime;
      }
      return changed ? next : previous;
    });
  }, [sessions]);

  useEffect(() => {
    if (selectedSessionID) {
      setThreadRuntime((previous) => {
        if (previous[selectedSessionID]) return previous;
        const resolved = resolveRuntime(null).runtime;
        return {
          ...previous,
          [selectedSessionID]: { ...resolved, updatedAt: Date.now() },
        };
      });
      return;
    }
    setDraftRuntime((previous) => previous ?? { ...resolveRuntime(null).runtime, updatedAt: Date.now() });
  }, [selectedSessionID, resolveRuntime]);

  function diagnosticsContext() {
    return {
      selectedWorkspace: selectedWorkspace || null,
      selectedSessionID: selectedSessionID || null,
      selectedRuntime: activeRuntime
        ? {
            agentName: activeRuntime.agentName,
            providerID: activeRuntime.providerID,
            modelID: activeRuntime.modelID,
          }
        : null,
      runtimeError: lastRuntimeError,
    };
  }

  async function collectDiagnostics() {
    try {
      const snapshot = await window.electron.diagnostics.collect(diagnosticsContext());
      setDiagnosticsID(snapshot.id);
      return snapshot;
    } catch (reason) {
      setErrorFromReason(reason);
      return null;
    }
  }

  async function exportDiagnostics() {
    try {
      const result = await window.electron.diagnostics.exportZip(diagnosticsContext());
      setDiagnosticsID(result.id);
      setDiagnosticsPath(result.filePath);
      await window.electron.diagnostics.openFolder(result.filePath);
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function reportIssue() {
    const snapshot = await collectDiagnostics();
    if (!snapshot) return;

    const body = [
      "## KiloApp Bug Report",
      "",
      `- App Version: ${snapshot.appVersion}`,
      `- Platform: ${snapshot.platform} (${snapshot.arch})`,
      `- Connection State: ${health.state}`,
      `- Diagnostics ID: ${snapshot.id}`,
      `- Selected Workspace: ${snapshot.selectedWorkspace || "none"}`,
      `- Runtime Agent: ${snapshot.selectedRuntime?.agentName || "unknown"}`,
      `- Runtime Model: ${snapshot.selectedRuntime?.modelID || "unknown"}`,
      "",
      "### What happened",
      "Describe the issue and expected behavior.",
    ].join("\n");

    const issueUrl = new URL(settings.reportIssuesTo);
    issueUrl.searchParams.set("title", `[KiloApp] ${health.state} issue`);
    issueUrl.searchParams.set("body", body);

    try {
      await window.electron.shell.openExternal(issueUrl.toString());
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function refreshProviders() {
    try {
      setProviders(await api.listConfigProviders(selectedWorkspace || undefined));
    } catch {
      setProviders(null);
    }
  }

  async function refreshAgents() {
    setLoadingAgents(true);
    setAgentsError("");
    try {
      const nextAgents = await api.listAgents();
      setAgents(nextAgents);
      setDefaultAgent((current) => defaultAgentName(nextAgents, current || "code"));
    } catch (reason) {
      setAgents([]);
      setAgentsError(String(reason));
    } finally {
      setLoadingAgents(false);
    }
  }

  async function refreshSessions(showLoading = false) {
    if (!selectedWorkspace) {
      setSessions([]);
      setSelectedSessionID("");
      return;
    }
    if (showLoading) setLoadingSessions(true);
    try {
      const next = await api.listSessions(selectedWorkspace);
      setSessions(next);
      if (!next.some((session) => session.id === selectedSessionID)) setSelectedSessionID(next[0]?.id ?? "");
      clearError();
    } catch (reason) {
      if (isMissingWorkspaceError(reason)) {
        removeWorkspace(selectedWorkspace);
        setErrorInfo({
          category: "api_error",
          message: "A workspace no longer exists on disk and was removed from the sidebar.",
        });
      } else {
        setErrorFromReason(reason);
      }
    } finally {
      setLoadingSessions(false);
    }
  }

  async function refreshMessages(showLoading = false) {
    if (!selectedWorkspace || !selectedSessionID) {
      setMessages([]);
      setBusy(false);
      return;
    }
    if (showLoading) setLoadingMessages(true);
    try {
      const [nextMessages, statuses] = await Promise.all([
        api.listMessages(selectedWorkspace, selectedSessionID),
        api.sessionStatus(selectedWorkspace),
      ]);
      setMessages(nextMessages);
      const status = statuses[selectedSessionID];
      setBusy(status ? status.type !== "idle" : false);
      clearError();
    } catch (reason) {
      setErrorFromReason(reason);
      setBusy(false);
    } finally {
      setLoadingMessages(false);
    }
  }

  refreshRef.current = { refreshSessions, refreshMessages, refreshProviders, refreshAgents };

  async function waitForHealthy(delays = [250, 500, 1000, 1500, 2500, 3000]) {
    for (const delay of delays) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const next = await api.health();
        setHealth({ state: "healthy", text: `Online · v${next.version}` });
        await Promise.all([refreshProviders(), refreshAgents()]);
        return true;
      } catch {
        // retry
      }
    }
    return false;
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      clearError();
      setHealth({ state: "booting", text: "Booting KiloApp..." });
      setHealth({ state: "checking_cli", text: "Checking Kilo CLI..." });

      try {
        const info = await window.electron.kilo.getCliInfo();
        if (cancelled) return;
        setCliInfo(info);
        if (!info.installed) {
          setErrorInfo({
            category: "cli_missing",
            message: "Kilo CLI was not found. Install it from kilo.ai/cli and restart KiloApp.",
          });
          setHealth({
            state: "degraded",
            text: "Kilo CLI not found",
            category: "cli_missing",
          });
          return;
        }
      } catch (reason) {
        if (cancelled) return;
        setErrorFromReason(reason);
        setHealth({ state: "degraded", text: "Failed to check Kilo CLI", category: "unknown" });
        return;
      }

      try {
        const home = await window.electron.kilo.getHomeDirectory();
        if (cancelled || !home) return;
        setWorkspaces((current) => {
          if (current.includes(home)) return current;
          return [home, ...current];
        });
        setSelectedWorkspace((current) => current || home);
      } catch {
        // optional boot helper
      }

      setHealth({ state: "starting_server", text: "Starting local server..." });

      try {
        const next = await window.electron.kilo.startServer(DEFAULT_PORT);
        if (cancelled) return;
        setServerState(next);
      } catch (reason) {
        if (cancelled) return;
        setErrorFromReason(reason);
        setHealth({ state: "degraded", text: "Could not start local server", category: "server_unreachable" });
        return;
      }

      const healthy = await waitForHealthy();
      if (cancelled) return;
      if (healthy) return;

      setHealth({ state: "degraded", text: "Server is not healthy yet", category: "server_unreachable" });
      setErrorInfo({
        category: "server_unreachable",
        message: "Kilo server did not become healthy. Try Restart Server or Reconnect.",
      });
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sse.status === "connected") {
      api
        .health()
        .then((next) => {
          setHealth({ state: "healthy", text: `Online · v${next.version}` });
        })
        .catch(() => {
          // keep current state
        });
      return;
    }

    if (sse.status === "disconnected" && health.state === "healthy") {
      setHealth({ state: "degraded", text: "Live updates disconnected. Using polling.", category: "server_unreachable" });
    }
  }, [sse.status]);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = sse.subscribe("*", () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        refreshRef.current.refreshSessions();
        refreshRef.current.refreshMessages();
      }, 150);
    });

    return () => {
      unsub();
      if (debounce) clearTimeout(debounce);
    };
  }, [sse.subscribe]);

  useEffect(() => {
    if (sse.status === "connected") return;

    const timer = window.setInterval(async () => {
      try {
        const next = await api.health();
        setHealth({ state: "healthy", text: `Online · v${next.version}` });
      } catch {
        setHealth({
          state: "degraded",
          text: "Server offline. Reconnect to resume live updates.",
          category: "server_unreachable",
        });
      }
    }, 30000);

    return () => window.clearInterval(timer);
  }, [sse.status]);

  useEffect(() => {
    refreshSessions(true);
    refreshProviders();
    refreshAgents();
  }, [selectedWorkspace]);

  useEffect(() => {
    refreshMessages(true);
  }, [selectedWorkspace, selectedSessionID]);

  useEffect(() => {
    if (sse.status === "connected") return;
    if (!selectedWorkspace || !selectedSessionID) return;

    const timer = window.setInterval(() => refreshMessages(), 3000);
    return () => window.clearInterval(timer);
  }, [selectedWorkspace, selectedSessionID, sse.status]);

  async function addWorkspaceViaDialog() {
    try {
      const selected = await window.electron.dialog.openDirectory();
      if (!selected || selected.length === 0) return;
      const newPaths = selected.filter((workspacePath) => !workspaces.includes(workspacePath));
      if (newPaths.length === 0) return;
      setWorkspaces((current) => [...newPaths, ...current]);
      setSelectedWorkspace(newPaths[0]);
      clearError();
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  function removeWorkspace(workspacePath: string) {
    setWorkspaces((current) => current.filter((item) => item !== workspacePath));
    if (workspacePath !== selectedWorkspace) return;
    setSelectedWorkspace("");
    setSelectedSessionID("");
    setMessages([]);
  }

  function toggleWorkspaceCollapsed(workspacePath: string) {
    setCollapsedWorkspaces((previous) => {
      const next = new Set(previous);
      if (next.has(workspacePath)) {
        next.delete(workspacePath);
        return next;
      }
      next.add(workspacePath);
      return next;
    });
  }

  function setRuntimeForSelection(nextRuntime: AgentRuntimeState) {
    if (selectedSessionID) {
      setThreadRuntime((previous) => ({
        ...previous,
        [selectedSessionID]: { ...nextRuntime, updatedAt: Date.now() },
      }));
      return;
    }
    setDraftRuntime({ ...nextRuntime, updatedAt: Date.now() });
  }

  function rememberAgentModel(agentName: string, providerID: string, modelID: string) {
    if (!providerID || !modelID) return;
    setAgentModelMemory((previous) => ({
      ...previous,
      [agentName]: {
        providerID,
        modelID,
        updatedAt: Date.now(),
      },
    }));
  }

  function runtimeSelection(runtime: AgentRuntimeState) {
    return {
      agent: runtime.agentName,
      providerID: runtime.providerID,
      modelID: runtime.modelID,
    };
  }

  async function createThread() {
    if (!selectedWorkspace) {
      setErrorInfo({ category: "api_error", message: "Add a project before creating a session." });
      return;
    }

    clearError();
    const resolved = resolveRuntime(draftRuntime);
    if (resolved.warning) {
      setRuntimeNotice(resolved.warning);
      setLastRuntimeError(resolved.warning);
    }

    try {
      const created = await api.createSession(
        selectedWorkspace,
        "New session",
        runtimeSelection(resolved.runtime),
        onRuntimeFallback,
      );
      setSessions((current) => [created, ...current]);
      setSelectedSessionID(created.id);
      setMessages([]);
      setThreadRuntime((previous) => ({
        ...previous,
        [created.id]: { ...resolved.runtime, updatedAt: Date.now() },
      }));
      rememberAgentModel(resolved.runtime.agentName, resolved.runtime.providerID, resolved.runtime.modelID);
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function sendPrompt(event: FormEvent) {
    event.preventDefault();
    debugLog('sendPrompt called', { selectedSessionID, activeRuntime, composer: composer.substring(0, 50) });
    const text = composer.trim();
    if (!text) return;
    if (!selectedWorkspace) {
      setErrorInfo({ category: "api_error", message: "Add a project before sending prompts." });
      return;
    }

    clearError();
    setRuntimeNotice(null);

    try {
      const targetSessionID = selectedSessionID;
      if (targetSessionID) {
        const resolved = resolveRuntime(threadRuntime[targetSessionID] ?? null);
        if (resolved.warning) {
          setRuntimeNotice(resolved.warning);
          setLastRuntimeError(resolved.warning);
        }
        setThreadRuntime((previous) => ({
          ...previous,
          [targetSessionID]: { ...resolved.runtime, updatedAt: Date.now() },
        }));
        rememberAgentModel(resolved.runtime.agentName, resolved.runtime.providerID, resolved.runtime.modelID);
        setComposer("");
        setBusy(true);
        await api.prompt(
          selectedWorkspace,
          targetSessionID,
          text,
          runtimeSelection(resolved.runtime),
          onRuntimeFallback,
        );
        await refreshSessions();
        await refreshMessages();
        return;
      }

      const resolved = resolveRuntime(draftRuntime);
      if (resolved.warning) {
        setRuntimeNotice(resolved.warning);
        setLastRuntimeError(resolved.warning);
      }
      const created = await api.createSession(
        selectedWorkspace,
        "New session",
        runtimeSelection(resolved.runtime),
        onRuntimeFallback,
      );
      setSessions((current) => [created, ...current]);
      setSelectedSessionID(created.id);
      setThreadRuntime((previous) => ({
        ...previous,
        [created.id]: { ...resolved.runtime, updatedAt: Date.now() },
      }));
      rememberAgentModel(resolved.runtime.agentName, resolved.runtime.providerID, resolved.runtime.modelID);
      setComposer("");
      setBusy(true);
      await api.prompt(
        selectedWorkspace,
        created.id,
        text,
        runtimeSelection(resolved.runtime),
        onRuntimeFallback,
      );
      await refreshSessions();
      await refreshMessages();
    } catch (reason) {
      setErrorFromReason(reason);
      setBusy(false);
    }
  }

  async function abortRun() {
    if (!selectedWorkspace || !selectedSessionID) return;
    try {
      await api.abortSession(selectedWorkspace, selectedSessionID);
      setBusy(false);
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function selectAgent(agentName: string) {
    debugLog('selectAgent called with:', agentName);
    const current = activeRuntime;
    const requested = {
      ...current,
      agentName,
      providerID: current.providerID,
      modelID: current.modelID,
      updatedAt: Date.now(),
    };
    const resolved = resolveRuntime(requested);
    if (resolved.warning) {
      setRuntimeNotice(resolved.warning);
      setLastRuntimeError(resolved.warning);
    }

    setDefaultAgent(resolveAgentName(agentName));
    setRuntimeForSelection(resolved.runtime);
    rememberAgentModel(resolved.runtime.agentName, resolved.runtime.providerID, resolved.runtime.modelID);
  }

  async function selectModel(providerID: string, modelID: string, source: "manual" | "agent-switch" = "manual") {
    const current = activeRuntime;
    const nextRuntime: AgentRuntimeState = {
      agentName: current.agentName,
      providerID,
      modelID,
      updatedAt: Date.now(),
    };
    setRuntimeForSelection(nextRuntime);
    rememberAgentModel(current.agentName, providerID, modelID);
    setLastRuntimeError(null);
    if (source === "manual") setRuntimeNotice(null);

    setProviders((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        default: {
          ...previous.default,
          [providerID]: modelID,
        },
      };
    });

    try {
      await api.changeModel(modelID, selectedWorkspace || undefined);
      setTimeout(() => refreshProviders(), 2000);
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  const useQuickReply = useCallback((value: string) => {
    const nextValue = value.trim();
    if (!nextValue) return;

    setComposer((current) => {
      if (!current.trim()) return nextValue;
      if (current.endsWith("\n") || current.endsWith(" ")) return `${current}${nextValue}`;
      return `${current}\n${nextValue}`;
    });

    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(".composer textarea");
      input?.focus();
    });
  }, []);

  async function renameSession(sessionId: string, title: string) {
    if (!selectedWorkspace) return;
    try {
      await api.renameSession(selectedWorkspace, sessionId, title);
      setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, title } : session)));
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function forkSession(sessionId: string) {
    if (!selectedWorkspace) return;
    try {
      const forked = await api.forkSession(selectedWorkspace, sessionId);
      setSessions((current) => [forked, ...current]);
      setSelectedSessionID(forked.id);
      setThreadRuntime((previous) => {
        const sourceRuntime = previous[sessionId];
        if (!sourceRuntime) return previous;
        return {
          ...previous,
          [forked.id]: { ...sourceRuntime, updatedAt: Date.now() },
        };
      });
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!selectedWorkspace) return;
    try {
      await api.deleteSession(selectedWorkspace, sessionId);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setThreadRuntime((previous) => {
        if (!previous[sessionId]) return previous;
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      if (selectedSessionID !== sessionId) return;
      setSelectedSessionID("");
      setMessages([]);
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function compactSession(sessionId: string) {
    if (!selectedWorkspace) return;
    try {
      await api.compactSession(selectedWorkspace, sessionId);
      if (selectedSessionID === sessionId) {
        await refreshMessages();
      }
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function restartServer() {
    clearError();
    setHealth({ state: "starting_server", text: "Restarting local server..." });

    try {
      await window.electron.kilo.stopServer();
      const next = await window.electron.kilo.startServer(DEFAULT_PORT);
      setServerState(next);
      const healthy = await waitForHealthy([400, 800, 1200, 2000, 3000]);
      if (!healthy) {
        setHealth({ state: "degraded", text: "Server restart incomplete", category: "server_unreachable" });
      }
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function reconnect() {
    sse.reconnect();
    await restartServer();
  }

  async function openCliDocs() {
    try {
      await window.electron.shell.openExternal("https://kilo.ai/cli");
    } catch (reason) {
      setErrorFromReason(reason);
    }
  }

  async function handleCollectDiagnostics() {
    const snapshot: DiagnosticSnapshot | null = await collectDiagnostics();
    if (!snapshot) return null;

    setErrorInfo({
      category: "unknown",
      message: `Diagnostics collected (${snapshot.id}). Export to share with support.`,
    });
    return snapshot;
  }

  function useAgentFromPanel(agentName: string) {
    if (!selectedSessionID) {
      setRuntimeNotice("Open a session first, then select an agent.");
      return;
    }
    selectAgent(agentName);
    setActiveTab("threads");
  }

  return (
    <SSEContext.Provider value={sse}>
      <main className={`shell ${themeClass} ${densityClass} ${motionClass}`}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          sessions={sessions}
          selectedSessionID={selectedSessionID}
          collapsedWorkspaces={collapsedWorkspaces}
          loadingSessions={loadingSessions}
          sessionsByWorkspace={sessionsByWorkspace}
          onCreateThread={createThread}
          onAddWorkspace={addWorkspaceViaDialog}
          onRemoveWorkspace={removeWorkspace}
          onToggleCollapse={toggleWorkspaceCollapsed}
          onSelectWorkspace={setSelectedWorkspace}
          onSelectSession={setSelectedSessionID}
          onRefreshSessions={() => refreshSessions(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onRenameSession={renameSession}
          onForkSession={forkSession}
          onDeleteSession={deleteSession}
          onCompactSession={compactSession}
        />

        <section className="main-area">
          <StatusBar
            title={selectedSession?.title || "New session"}
            healthText={health.text}
            isOnline={isOnline}
            agentName={activeRuntime.agentName}
            modelName={activeModelName}
            connectionState={health.state}
          />

          <div className="panel-container">
            <div className="top-panel">
              {activeTab === "threads" && (
                <>
                  {showOnboarding && (
                    <div className="onboarding-card">
                      <h3>Finish setup</h3>
                      <p>Use these steps to get a stable coding session.</p>
                      <ol>
                        <li>Install and authenticate Kilo CLI: <code>kilo auth login</code>.</li>
                        <li>Add your project folder.</li>
                        <li>If needed, restart or reconnect the local server.</li>
                      </ol>
                      <div className="onboarding-actions">
                        <button className="ghost" onClick={openCliDocs}>
                          <ExternalLink size={12} />
                          CLI install guide
                        </button>
                        <button className="ghost" onClick={addWorkspaceViaDialog}>
                          <FolderPlus size={12} />
                          Add project
                        </button>
                        <button className="ghost" onClick={reconnect}>
                          <Wifi size={12} />
                          Reconnect
                        </button>
                      </div>
                    </div>
                  )}

                  {runtimeNotice && (
                    <div className="runtime-banner">
                      <p>
                        <AlertTriangle size={14} />
                        {runtimeNotice}
                      </p>
                      <button className="icon-button" aria-label="Dismiss runtime notice" onClick={() => setRuntimeNotice(null)}>
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {compatibility !== "ok" && (
                    <div className="runtime-banner warning">
                      <p>
                        <AlertTriangle size={14} />
                        {compatibility === "model_missing"
                          ? "Current model is no longer available. KiloApp will use a compatible fallback."
                          : "Selected agent is unavailable. KiloApp will use the default agent."}
                      </p>
                    </div>
                  )}

                  <ThreadView
                    messages={messages}
                    loadingMessages={loadingMessages}
                    busy={busy}
                    showHome={showHome}
                    selectedWorkspace={selectedWorkspace}
                    activityCollapsed={activityCollapsed}
                    activityHeight={activityHeight}
                    onToggleActivity={() => setActivityCollapsed((collapsed) => !collapsed)}
                    onResizeActivity={setActivityHeight}
                    onUseQuickReply={useQuickReply}
                  />

                  <PermissionBar api={api} directory={selectedWorkspace} />

                  <Composer
                    composer={composer}
                    setComposer={setComposer}
                    busy={busy}
                    providers={providers}
                    agents={agents}
                    activeAgentName={activeRuntime.agentName}
                    activeModelName={activeModelName}
                    activeModel={activeRuntime.providerID && activeRuntime.modelID ? {
                      providerID: activeRuntime.providerID,
                      modelID: activeRuntime.modelID,
                    } : null}
                    onSubmit={sendPrompt}
                    onAbort={abortRun}
                    onSelectAgent={selectAgent}
                    onSelectModel={selectModel}
                  />
                </>
              )}

              {activeTab === "cloud" && <CloudSessions api={api} onImported={() => refreshSessions(true)} />}

              {activeTab === "agents" && (
                <AgentsView
                  agents={agents}
                  loading={loadingAgents}
                  error={agentsError}
                  providers={providers}
                  activeRuntime={activeRuntime}
                  selectedSessionID={selectedSessionID}
                  onRefresh={refreshAgents}
                  onUseAgent={useAgentFromPanel}
                />
              )}

              {errorInfo && (
                <div className="error-banner">
                  <p className="error">
                    <AlertCircle size={14} />
                    {errorInfo.message}
                  </p>
                  <div className="error-actions">
                    <button className="ghost" onClick={restartServer}>
                      <RefreshCw size={12} />
                      Restart Server
                    </button>
                    <button className="ghost" onClick={reconnect}>
                      <Wifi size={12} />
                      Reconnect
                    </button>
                    <button className="ghost" onClick={handleCollectDiagnostics}>
                      <Bug size={12} />
                      Open Diagnostics
                    </button>
                    <button className="ghost" onClick={reportIssue}>
                      <ExternalLink size={12} />
                      Report Issue
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!terminalCollapsed && (
              <PanelSplitter
                direction="horizontal"
                onResize={(delta) => setTerminalHeight((height) => Math.max(100, Math.min(height - delta, 600)))}
              />
            )}

            <div className="bottom-panel" style={terminalCollapsed ? undefined : { height: terminalHeight }}>
              <TerminalPanel collapsed={terminalCollapsed} onToggleCollapse={() => setTerminalCollapsed((collapsed) => !collapsed)} />
            </div>
          </div>
        </section>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          api={api}
          providers={providers}
          healthText={health.text}
          isOnline={isOnline}
          cliInfo={cliInfo}
          connectionState={health.state}
          diagnosticsID={diagnosticsID}
          diagnosticsPath={diagnosticsPath}
          uiPreferences={uiPreferences}
          onChangeUiPreferences={updateUiPreferences}
          onResetUiAppearance={resetUiAppearance}
          onRestartServer={restartServer}
          onReconnect={reconnect}
          onCollectDiagnostics={handleCollectDiagnostics}
          onExportDiagnostics={exportDiagnostics}
          onReportIssue={reportIssue}
        />
      </main>
    </SSEContext.Provider>
  );
}

export default App;
