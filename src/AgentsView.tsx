import { Bot, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import type { Agent, AgentCompatibility, AgentRuntimeState, ProviderListResponse } from "./types";
import { runtimeCompatibility, splitAgentsByMode } from "./utils";

type AgentsViewProps = {
  agents: Agent[];
  loading: boolean;
  error: string;
  providers: ProviderListResponse | null;
  activeRuntime: AgentRuntimeState | null;
  selectedSessionID: string;
  onRefresh: () => void;
  onUseAgent: (agentName: string) => void;
};

function permissionSummary(agent: Agent): string {
  const list = agent.permission ?? [];
  if (list.length === 0) return "No explicit permissions";
  const counts = { allow: 0, ask: 0, deny: 0 };
  for (const entry of list) {
    if (entry.action === "allow") counts.allow += 1;
    if (entry.action === "ask") counts.ask += 1;
    if (entry.action === "deny") counts.deny += 1;
  }
  return `allow ${counts.allow} · ask ${counts.ask} · deny ${counts.deny}`;
}

function compatibilityLabel(value: AgentCompatibility): string {
  if (value === "ok") return "Compatible";
  if (value === "model_missing") return "Current model unavailable";
  return "Agent unavailable";
}

export function AgentsView({
  agents,
  loading,
  error,
  providers,
  activeRuntime,
  selectedSessionID,
  onRefresh,
  onUseAgent,
}: AgentsViewProps) {
  const grouped = splitAgentsByMode(agents);
  const compatibility = runtimeCompatibility(agents, providers, activeRuntime);
  const hasThread = !!selectedSessionID;

  return (
    <div className="agents-view">
      <div className="agents-header">
        <h2><Bot size={16} /> Agents</h2>
        <button className="icon-button" onClick={onRefresh} aria-label="Refresh">
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

      {!loading && agents.length > 0 && (
        <>
          <div className="agents-compatibility">
            {compatibility === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{compatibilityLabel(compatibility)}</span>
          </div>

          <section className="agents-section">
            <h3>Primary modes</h3>
            <div className="agents-grid">
              {grouped.primary.map((agent) => {
                const isActive = activeRuntime?.agentName === agent.name;
                return (
                  <div key={agent.name} className={`agent-card ${isActive ? "active" : ""}`}>
                    <div className="agent-card-header">
                      <Bot size={14} />
                      <span className="agent-card-name">{agent.name}</span>
                      {agent.native && <span className="agent-card-badge">native</span>}
                    </div>
                    <p className="agent-card-desc">{agent.description}</p>
                    <span className="agent-card-mode">Mode: primary</span>
                    <span className="agent-card-summary">{permissionSummary(agent)}</span>
                    <div className="agent-card-actions">
                      <button
                        className="ghost"
                        disabled={!hasThread}
                        onClick={() => onUseAgent(agent.name)}
                      >
                        {isActive ? "Using in this session" : "Use in this session"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {grouped.subagent.length > 0 && (
            <section className="agents-section">
              <h3>Subagents (informational)</h3>
              <div className="agents-grid">
                {grouped.subagent.map((agent) => (
                  <div key={agent.name} className="agent-card subagent">
                    <div className="agent-card-header">
                      <Bot size={14} />
                      <span className="agent-card-name">{agent.name}</span>
                    </div>
                    <p className="agent-card-desc">{agent.description}</p>
                    <span className="agent-card-mode">Mode: subagent</span>
                    <span className="agent-card-summary">{permissionSummary(agent)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
