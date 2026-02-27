import { useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { KiloApi } from "./api";
import type { Agent } from "./types";

type AgentsViewProps = {
  api: KiloApi;
};

export function AgentsView({ api }: AgentsViewProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchAgents() {
    setLoading(true);
    setError("");
    try {
      setAgents(await api.listAgents());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAgents(); }, []);

  return (
    <div className="agents-view">
      <div className="agents-header">
        <h2><Bot size={16} /> Agents</h2>
        <button className="icon-button" onClick={fetchAgents} aria-label="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {loading && (
        <div className="agents-loading">
          <span className="working-spinner" />
          <span>Loading agents...</span>
        </div>
      )}

      {error && <p className="agents-error">{error}</p>}

      {!loading && agents.length === 0 && !error && (
        <div className="agents-empty">
          <Bot size={32} />
          <p>No agents configured</p>
        </div>
      )}

      <div className="agents-grid">
        {agents.map((agent) => (
          <div key={agent.name} className="agent-card">
            <div className="agent-card-header">
              <Bot size={14} />
              <span className="agent-card-name">{agent.name}</span>
              {agent.native && <span className="agent-card-badge">native</span>}
            </div>
            <p className="agent-card-desc">{agent.description}</p>
            {agent.mode && (
              <span className="agent-card-mode">Mode: {agent.mode}</span>
            )}
            {agent.permission && agent.permission.length > 0 && (
              <div className="agent-card-perms">
                {agent.permission.map((p, idx) => (
                  <span key={idx} className="agent-card-perm">
                    {p.action}: {p.pattern}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
