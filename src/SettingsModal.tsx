import { useEffect, useState } from "react";
import { X, User, Server, RefreshCw, ExternalLink, Terminal, Bug, Download, Wifi } from "lucide-react";
import { KiloApi } from "./api";
import type {
  ConnectionState,
  DiagnosticSnapshot,
  KiloCliInfo,
  KiloProfile,
  ProviderListResponse,
  UiPreferencesV1,
} from "./types";
import { modelLabel } from "./utils";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  api: KiloApi;
  providers: ProviderListResponse | null;
  healthText: string;
  isOnline: boolean;
  cliInfo: KiloCliInfo;
  connectionState: ConnectionState;
  diagnosticsID: string;
  diagnosticsPath: string;
  uiPreferences: UiPreferencesV1;
  onChangeUiPreferences: (partial: Partial<UiPreferencesV1>) => void;
  onResetUiAppearance: () => void;
  onRestartServer: () => void;
  onReconnect: () => void;
  onCollectDiagnostics: () => Promise<DiagnosticSnapshot | null>;
  onExportDiagnostics: () => Promise<void>;
  onReportIssue: () => Promise<void>;
};

export function SettingsModal({
  open,
  onClose,
  api,
  providers,
  healthText,
  isOnline,
  cliInfo,
  connectionState,
  diagnosticsID,
  diagnosticsPath,
  uiPreferences,
  onChangeUiPreferences,
  onResetUiAppearance,
  onRestartServer,
  onReconnect,
  onCollectDiagnostics,
  onExportDiagnostics,
  onReportIssue,
}: SettingsModalProps) {
  const [profile, setProfile] = useState<KiloProfile | null>(null);
  const [connectHint, setConnectHint] = useState("");
  const [collecting, setCollecting] = useState(false);
  const connectionLabel = connectionState.replace(/_/g, " ");

  useEffect(() => {
    if (!open) return;
    api.getProfile().then(setProfile).catch(() => setProfile(null));
  }, [open, api]);

  const kiloConnected = providers?.connected.includes("kilo") ?? false;
  const hasProfile = profile?.profile?.username || profile?.profile?.email;

  function showLoginHint() {
    setConnectHint("Run `kilo auth login` in your terminal, then reopen Settings.");
  }

  async function openKiloSite() {
    try {
      await window.electron.shell.openExternal("https://app.kilo.ai");
    } catch { /* ignore */ }
  }

  async function handleCollectDiagnostics() {
    setCollecting(true);
    try {
      await onCollectDiagnostics();
    } finally {
      setCollecting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="settings-section">
          <h3><User size={14} /> Account</h3>
          <div className="settings-info">
            {hasProfile ? (
              <>
                <div className="settings-info-row">
                  <span>Username</span>
                  <span className="status-good">{profile!.profile!.username}</span>
                </div>
                {profile!.profile!.email && (
                  <div className="settings-info-row">
                    <span>Email</span>
                    <span>{profile!.profile!.email}</span>
                  </div>
                )}
                {profile!.balance !== undefined && (
                  <div className="settings-info-row">
                    <span>Balance</span>
                    <span>${(profile!.balance! / 100).toFixed(2)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="settings-info-row">
                <span>Kilo Gateway</span>
                <span className={kiloConnected ? "status-good" : "status-bad"}>
                  {kiloConnected ? "connected" : "not connected"}
                </span>
              </div>
            )}
            <div className="settings-info-row">
              <span>Provider</span>
              <span className={providers?.connected.length ? "status-good" : "status-bad"}>
                {providers?.connected.join(", ") || "none connected"}
              </span>
            </div>
            <div className="settings-info-row">
              <span>Model</span>
              <span>{modelLabel(providers)}</span>
            </div>
          </div>
          {!kiloConnected && (
            <div className="settings-actions">
              <button className="primary" onClick={showLoginHint}>
                <Terminal size={12} />
                Connect Kilo Account
              </button>
              <button className="ghost" onClick={openKiloSite}>
                <ExternalLink size={12} />
                kilo.ai
              </button>
            </div>
          )}
          {connectHint && (
            <div className="settings-hint">
              <Terminal size={12} />
              <code>kilo auth login</code>
              <span>Run this in your terminal, then close and reopen Settings.</span>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>UI Experience</h3>
          <div className="settings-grid settings-ui-grid">
            <label>
              Theme variant
              <select
                value={uiPreferences.themeVariant}
                onChange={(event) => onChangeUiPreferences({ themeVariant: event.target.value as UiPreferencesV1["themeVariant"] })}
              >
                <option value="classic">Classic</option>
                <option value="industrial_neon_v2">Industrial Neon v2</option>
              </select>
            </label>
            <label>
              Density
              <select
                value={uiPreferences.density}
                onChange={(event) => onChangeUiPreferences({ density: event.target.value as UiPreferencesV1["density"] })}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label>
              Motion
              <select
                value={uiPreferences.motion}
                onChange={(event) => onChangeUiPreferences({ motion: event.target.value as UiPreferencesV1["motion"] })}
              >
                <option value="full">Full</option>
                <option value="reduced">Reduced</option>
              </select>
            </label>
          </div>
          <div className="settings-actions">
            <button className="ghost" onClick={onResetUiAppearance}>
              Reset appearance
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3><Server size={14} /> Server</h3>
          <div className="settings-info">
            <div className="settings-info-row">
              <span>Status</span>
              <span className={isOnline ? "status-good" : "status-bad"}>
                {healthText}
              </span>
            </div>
            <div className="settings-info-row">
              <span>CLI</span>
              <span>{cliInfo.installed ? cliInfo.version || "installed" : "not found"}</span>
            </div>
            <div className="settings-info-row">
              <span>Port</span>
              <span>4100</span>
            </div>
            <div className="settings-info-row">
              <span>Connection</span>
              <span>{connectionLabel}</span>
            </div>
            {diagnosticsID && (
              <div className="settings-info-row">
                <span>Diagnostics ID</span>
                <span>{diagnosticsID}</span>
              </div>
            )}
            {diagnosticsPath && (
              <div className="settings-info-row">
                <span>Last Bundle</span>
                <span title={diagnosticsPath}>{diagnosticsPath.split("/").pop()}</span>
              </div>
            )}
          </div>
          <div className="settings-actions">
            <button className="ghost" onClick={onRestartServer}>
              <RefreshCw size={12} />
              Restart Server
            </button>
            <button className="ghost" onClick={onReconnect}>
              <Wifi size={12} />
              Reconnect
            </button>
            <button className="ghost" onClick={handleCollectDiagnostics} disabled={collecting}>
              <Bug size={12} />
              {collecting ? "Collecting..." : "Open Diagnostics"}
            </button>
            <button className="ghost" onClick={onExportDiagnostics}>
              <Download size={12} />
              Export Diagnostics
            </button>
            <button className="ghost" onClick={onReportIssue}>
              <ExternalLink size={12} />
              Report Issue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
