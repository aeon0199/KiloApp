import { FormEvent, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { KiloApi } from "./api";
import type { KiloCliInfo, KiloServerState, MessageWithParts, ProviderListResponse, SessionInfo } from "./types";
import { modelLabel } from "./utils";
import { useSSEConnection, SSEContext } from "./hooks";
import { Sidebar, type SidebarTab } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { ThreadView } from "./ThreadView";
import { Composer } from "./Composer";
import { SettingsModal } from "./SettingsModal";
import { PermissionBar } from "./PermissionBar";
import { CloudSessions } from "./CloudSessions";
import { AgentsView } from "./AgentsView";
import "./App.css";

const STORAGE_WORKSPACES = "kiloapp.workspaces";
const STORAGE_WORKSPACE = "kiloapp.selectedWorkspace";
const STORAGE_COLLAPSED = "kiloapp.collapsedWorkspaces";

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

function App() {
  const [cliInfo, setCliInfo] = useState<KiloCliInfo>({ installed: false });
  const [, setServerState] = useState<KiloServerState>({ managed: false, running: false, port: 4100, url: "http://127.0.0.1:4100" });
  const serverUrl = "http://127.0.0.1:4100";
  const [healthText, setHealthText] = useState("Connecting...");
  const [workspaces, setWorkspaces] = useState<string[]>(readStringList(STORAGE_WORKSPACES));
  const [selectedWorkspace, setSelectedWorkspace] = useState(readString(STORAGE_WORKSPACE, ""));
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionID, setSelectedSessionID] = useState("");
  const [messages, setMessages] = useState<MessageWithParts[]>([]);
  const [providers, setProviders] = useState<ProviderListResponse | null>(null);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("threads");
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_COLLAPSED);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [activityHeight, setActivityHeight] = useState(200);

  const selectedSession = sessions.find((s) => s.id === selectedSessionID);
  const api = useMemo(() => new KiloApi(serverUrl), []);
  const sse = useSSEConnection(serverUrl);
  const isOnline = healthText.startsWith("Online") || sse.status === "connected";
  const showHome = !selectedSessionID;

  // Ref to latest refresh functions so SSE callbacks don't capture stale closures
  const refreshRef = useRef({ refreshSessions: () => {}, refreshMessages: () => {}, refreshProviders: () => {} });

  const sessionsByWorkspace = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const ws of workspaces) map.set(ws, []);
    for (const session of sessions) {
      const existing = map.get(session.directory) ?? map.get(selectedWorkspace) ?? [];
      if (!map.has(session.directory) && !map.has(selectedWorkspace)) {
        map.set(session.directory || selectedWorkspace, existing);
      }
      existing.push(session);
    }
    return map;
  }, [sessions, workspaces, selectedWorkspace]);

  // Persist state
  useEffect(() => { localStorage.setItem(STORAGE_WORKSPACES, JSON.stringify(workspaces)); }, [workspaces]);
  useEffect(() => { localStorage.setItem(STORAGE_WORKSPACE, selectedWorkspace); }, [selectedWorkspace]);
  useEffect(() => { localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify([...collapsedWorkspaces])); }, [collapsedWorkspaces]);

  // Electron handles window dragging natively via CSS -webkit-app-region: drag
  const startDrag = useCallback((_e: React.MouseEvent) => {}, []);

  // ── API helpers ──────────────────────────────────────────────
  async function refreshProviders() {
    try { setProviders(await api.listConfigProviders(selectedWorkspace || undefined)); }
    catch { setProviders(null); }
  }

  async function refreshSessions(showLoading = false) {
    if (!selectedWorkspace) { setSessions([]); setSelectedSessionID(""); return; }
    if (showLoading) setLoadingSessions(true);
    try {
      const next = await api.listSessions(selectedWorkspace);
      setSessions(next);
      if (!next.some((s) => s.id === selectedSessionID)) setSelectedSessionID(next[0]?.id ?? "");
    } catch (reason) { setError(String(reason)); }
    finally { setLoadingSessions(false); }
  }

  async function refreshMessages(showLoading = false) {
    if (!selectedWorkspace || !selectedSessionID) { setMessages([]); setBusy(false); return; }
    if (showLoading) setLoadingMessages(true);
    try {
      const [nextMessages, statuses] = await Promise.all([
        api.listMessages(selectedWorkspace, selectedSessionID),
        api.sessionStatus(selectedWorkspace),
      ]);
      setMessages(nextMessages);
      const status = statuses[selectedSessionID];
      setBusy(status ? status.type !== "idle" : false);
    } catch (reason) { setError(String(reason)); setBusy(false); }
    finally { setLoadingMessages(false); }
  }

  // Keep ref up to date so SSE callbacks always use latest
  refreshRef.current = { refreshSessions, refreshMessages, refreshProviders };

  // ── Boot ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try { setCliInfo(await window.electron.invoke("kilo:cli-info") as KiloCliInfo); } catch (r) { setError(String(r)); }

      // Ensure home directory is always the default workspace
      try {
        const home = await window.electron.invoke("kilo:home-directory") as string;
        if (home) {
          setWorkspaces((cur) => {
            if (cur.includes(home)) return cur;
            return [home, ...cur];
          });
          setSelectedWorkspace(home);
        }
      } catch { /* ignore */ }

      try {
        const next = await window.electron.invoke("kilo:start-server", 4100) as KiloServerState;
        setServerState(next);
      } catch { /* server may already be running */ }
      for (const delay of [300, 500, 1000, 1500, 2000, 3000]) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, delay));
        try {
          const h = await api.health();
          if (!cancelled) { setHealthText(`Online · v${h.version}`); refreshProviders(); }
          return;
        } catch { /* not ready yet */ }
      }
      if (!cancelled) setHealthText("Offline");
    }
    boot();
    return () => { cancelled = true; };
  }, []);

  // ── SSE-driven real-time updates ─────────────────────────────
  // Update health text when SSE connection status changes
  useEffect(() => {
    if (sse.status === "connected") {
      api.health().then((h) => setHealthText(`Online · v${h.version}`)).catch(() => {});
    } else if (sse.status === "disconnected") {
      api.health().then((h) => setHealthText(`Online · v${h.version}`)).catch(() => setHealthText("Offline"));
    }
  }, [sse.status]);

  // Subscribe to all SSE events — debounce rapid-fire updates
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = sse.subscribe("*", () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        refreshRef.current.refreshSessions();
        refreshRef.current.refreshMessages();
      }, 150);
    });
    return () => { unsub(); if (debounce) clearTimeout(debounce); };
  }, [sse.subscribe]);

  // Fallback health poll — only when SSE is not connected (30s interval)
  useEffect(() => {
    if (sse.status === "connected") return;
    const t = window.setInterval(async () => {
      try { const h = await api.health(); setHealthText(`Online · v${h.version}`); }
      catch { setHealthText("Offline"); }
    }, 30000);
    return () => window.clearInterval(t);
  }, [sse.status]);

  // Initial data load when workspace changes
  useEffect(() => { refreshSessions(true); refreshProviders(); }, [selectedWorkspace]);

  // Initial message load when session changes
  useEffect(() => { refreshMessages(true); }, [selectedWorkspace, selectedSessionID]);

  // Fallback message polling — only when SSE is not connected
  useEffect(() => {
    if (sse.status === "connected") return;
    if (!selectedWorkspace || !selectedSessionID) return;
    const t = window.setInterval(() => refreshMessages(), 3000);
    return () => window.clearInterval(t);
  }, [selectedWorkspace, selectedSessionID, sse.status]);

  // ── Actions ──────────────────────────────────────────────────
  async function addWorkspaceViaDialog() {
    try {
      const selected = await window.electron.openDirectoryDialog();
      if (!selected) return;
      const paths = selected;
      const newPaths = paths.filter((p) => !workspaces.includes(p));
      if (newPaths.length > 0) { setWorkspaces((cur) => [...newPaths, ...cur]); setSelectedWorkspace(newPaths[0]); }
    } catch (reason) { setError(String(reason)); }
  }

  function removeWorkspace(path: string) {
    setWorkspaces((cur) => cur.filter((w) => w !== path));
    if (path === selectedWorkspace) { setSelectedWorkspace(""); setSelectedSessionID(""); setMessages([]); }
  }

  function toggleWorkspaceCollapsed(path: string) {
    setCollapsedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  async function createThread() {
    if (!selectedWorkspace) { setError("Add a project first."); return; }
    setError("");
    try {
      const created = await api.createSession(selectedWorkspace, "New thread");
      setSessions((cur) => [created, ...cur]);
      setSelectedSessionID(created.id);
      setMessages([]);
    } catch (reason) { setError(String(reason)); }
  }

  async function sendPrompt(event: FormEvent) {
    event.preventDefault();
    const text = composer.trim();
    if (!text) return;
    if (!selectedWorkspace) { setError("Add a project first."); return; }
    setError("");
    let sessionID = selectedSessionID;
    try {
      if (!sessionID) {
        const created = await api.createSession(selectedWorkspace, "New thread");
        sessionID = created.id;
        setSessions((cur) => [created, ...cur]);
        setSelectedSessionID(sessionID);
      }
      setComposer(""); setBusy(true);
      await api.prompt(selectedWorkspace, sessionID, text);
      await refreshSessions();
      await refreshMessages();
    } catch (reason) { setError(String(reason)); setBusy(false); }
  }

  async function abortRun() {
    if (!selectedWorkspace || !selectedSessionID) return;
    try { await api.abortSession(selectedWorkspace, selectedSessionID); setBusy(false); }
    catch (reason) { setError(String(reason)); }
  }

  async function selectModel(_providerID: string, modelID: string) {
    // Optimistically update UI immediately
    setProviders((prev) => {
      if (!prev) return prev;
      const next = { ...prev, default: { ...prev.default } };
      for (const pid of prev.connected) next.default[pid] = modelID;
      return next;
    });
    try {
      await api.changeModel(modelID, selectedWorkspace || undefined);
      // Refresh after server processes the change
      setTimeout(() => refreshProviders(), 2000);
    } catch (reason) { setError(String(reason)); }
  }

  async function renameSession(sessionId: string, title: string) {
    if (!selectedWorkspace) return;
    try {
      await api.renameSession(selectedWorkspace, sessionId, title);
      setSessions((cur) => cur.map((s) => s.id === sessionId ? { ...s, title } : s));
    } catch (reason) { setError(String(reason)); }
  }

  async function forkSession(sessionId: string) {
    if (!selectedWorkspace) return;
    try {
      const forked = await api.forkSession(selectedWorkspace, sessionId);
      setSessions((cur) => [forked, ...cur]);
      setSelectedSessionID(forked.id);
    } catch (reason) { setError(String(reason)); }
  }

  async function deleteSession(sessionId: string) {
    if (!selectedWorkspace) return;
    try {
      await api.deleteSession(selectedWorkspace, sessionId);
      setSessions((cur) => cur.filter((s) => s.id !== sessionId));
      if (selectedSessionID === sessionId) {
        setSelectedSessionID("");
        setMessages([]);
      }
    } catch (reason) { setError(String(reason)); }
  }

  async function compactSession(sessionId: string) {
    if (!selectedWorkspace) return;
    try {
      await api.compactSession(selectedWorkspace, sessionId);
      if (selectedSessionID === sessionId) await refreshMessages();
    } catch (reason) { setError(String(reason)); }
  }

  async function restartServer() {
    setError(""); setHealthText("Restarting...");
    try {
      await window.electron.invoke("kilo:stop-server");
      const next = await window.electron.invoke("kilo:start-server", 4100) as KiloServerState;
      setServerState(next);
      for (const delay of [500, 1000, 2000, 3000]) {
        await new Promise((r) => setTimeout(r, delay));
        try { const h = await api.health(); setHealthText(`Online · v${h.version}`); return; } catch { /* retry */ }
      }
      setHealthText("Offline");
    } catch (reason) { setError(String(reason)); }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <SSEContext.Provider value={sse}>
    <main className="shell">
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
        startDrag={startDrag}
      />

      <section className="main-area">
        <StatusBar
          title={selectedSession?.title || "New thread"}
          healthText={healthText}
          isOnline={isOnline}
          modelName={modelLabel(providers)}
          startDrag={startDrag}
        />

        {activeTab === "threads" && (
          <>
            <ThreadView
              messages={messages}
              loadingMessages={loadingMessages}
              busy={busy}
              showHome={showHome}
              selectedWorkspace={selectedWorkspace}
              activityCollapsed={activityCollapsed}
              activityHeight={activityHeight}
              onToggleActivity={() => setActivityCollapsed((c) => !c)}
              onResizeActivity={setActivityHeight}
            />

            <PermissionBar api={api} directory={selectedWorkspace} />

            <Composer
              composer={composer}
              setComposer={setComposer}
              busy={busy}
              providers={providers}
              onSubmit={sendPrompt}
              onAbort={abortRun}
              onSelectModel={selectModel}
            />
          </>
        )}

        {activeTab === "cloud" && (
          <CloudSessions api={api} onImported={() => refreshSessions(true)} />
        )}

        {activeTab === "agents" && (
          <AgentsView api={api} />
        )}

        {error && <p className="error"><AlertCircle size={14} />{error}</p>}
      </section>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        api={api}
        providers={providers}
        healthText={healthText}
        isOnline={isOnline}
        cliInfo={cliInfo}
        onRestartServer={restartServer}
      />
    </main>
    </SSEContext.Provider>
  );
}

export default App;
