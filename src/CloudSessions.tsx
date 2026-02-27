import { useEffect, useState } from "react";
import { Cloud, Download, RefreshCw } from "lucide-react";
import { KiloApi } from "./api";
import type { CloudSessionEntry } from "./types";
import { relativeTime } from "./utils";

type CloudSessionsProps = {
  api: KiloApi;
  onImported: () => void;
};

export function CloudSessions({ api, onImported }: CloudSessionsProps) {
  const [sessions, setSessions] = useState<CloudSessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  async function fetchSessions() {
    setLoading(true);
    setError("");
    try {
      const res = await api.listCloudSessions();
      setSessions(res.cliSessions);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSessions(); }, []);

  async function importSession(id: string) {
    setImporting(id);
    try {
      await api.importCloudSession(id);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="cloud-sessions">
      <div className="cloud-sessions-header">
        <h2><Cloud size={16} /> Cloud Sessions</h2>
        <button className="icon-button" onClick={fetchSessions} aria-label="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {loading && (
        <div className="cloud-sessions-loading">
          <span className="working-spinner" />
          <span>Loading cloud sessions...</span>
        </div>
      )}

      {error && <p className="cloud-sessions-error">{error}</p>}

      {!loading && sessions.length === 0 && !error && (
        <div className="cloud-sessions-empty">
          <Cloud size={32} />
          <p>No cloud sessions found</p>
          <p className="muted">Sessions from other devices will appear here</p>
        </div>
      )}

      <div className="cloud-sessions-list">
        {sessions.map((session) => (
          <div key={session.id} className="cloud-session-item">
            <div className="cloud-session-info">
              <span className="cloud-session-title">{session.title || "Untitled"}</span>
              <div className="cloud-session-meta">
                {session.device && <span>{session.device}</span>}
                {session.directory && <span>{session.directory}</span>}
                {session.time && <span>{relativeTime(session.time.updated)}</span>}
              </div>
            </div>
            <button
              className="cloud-session-import"
              onClick={() => importSession(session.id)}
              disabled={importing === session.id}
            >
              <Download size={12} />
              {importing === session.id ? "Importing..." : "Import"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
