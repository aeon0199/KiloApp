import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Send, Zap, Circle, ChevronDown, Check, Bot, ChevronRight } from "lucide-react";
import type { Agent, ProviderListResponse } from "./types";
import { availableModels, splitAgentsByMode } from "./utils";

type ComposerProps = {
  composer: string;
  setComposer: (value: string) => void;
  busy: boolean;
  providers: ProviderListResponse | null;
  agents: Agent[];
  activeAgentName: string;
  activeModelName: string;
  activeModel: { providerID: string; modelID: string } | null;
  onSubmit: (e: FormEvent) => void;
  onAbort: () => void;
  onSelectAgent: (agentName: string) => void;
  onSelectModel: (providerID: string, modelID: string, source?: "manual" | "agent-switch") => void;
};

export function Composer({
  composer,
  setComposer,
  busy,
  providers,
  agents,
  activeAgentName,
  activeModelName,
  activeModel,
  onSubmit,
  onAbort,
  onSelectAgent,
  onSelectModel,
}: ComposerProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [accessPickerOpen, setAccessPickerOpen] = useState(false);
  const [advancedAgentsOpen, setAdvancedAgentsOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const agentPickerRef = useRef<HTMLDivElement>(null);
  const accessPickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentGroups = splitAgentsByMode(agents);

  // Auto-grow textarea
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "24px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  useEffect(() => { autoGrow(); }, [composer, autoGrow]);

  useEffect(() => {
    if (!modelPickerOpen && !agentPickerOpen && !accessPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setAgentPickerOpen(false);
      }
      if (accessPickerRef.current && !accessPickerRef.current.contains(e.target as Node)) {
        setAccessPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [accessPickerOpen, agentPickerOpen, modelPickerOpen]);

  function handleSelectModel(providerID: string, modelID: string) {
    onSelectModel(providerID, modelID, "manual");
    setModelPickerOpen(false);
  }

  function handleSelectAgent(agentName: string) {
    onSelectAgent(agentName);
    setAgentPickerOpen(false);
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer-input">
        <div className="composer-main-row">
          <textarea
            ref={textareaRef}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Ask Kilo to build, debug, or refactor..."
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (composer.trim()) e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {busy ? (
            <button type="button" className="composer-action is-stop" onClick={onAbort} aria-label="Stop">
              <span className="composer-action-spinner" />
              <span className="composer-action-stop-square" />
            </button>
          ) : (
            <button type="submit" className="composer-action" disabled={!composer.trim()} aria-label="Send">
              <Send size={12} />
            </button>
          )}
        </div>
        <div className="composer-controls-row">
          <div className="model-picker-wrapper" ref={agentPickerRef}>
            <button
              type="button"
              className="meta-pill clickable"
              onClick={() => {
                setAgentPickerOpen(!agentPickerOpen);
                setModelPickerOpen(false);
                setAccessPickerOpen(false);
              }}
            >
              <Bot size={10} />
              {activeAgentName || "code"}
              <ChevronDown size={10} />
            </button>
            {agentPickerOpen && (
              <div className="model-picker agent-picker">
                <div className="model-picker-header">Select agent</div>
                {agentGroups.primary.map((agent) => {
                  const isActive = activeAgentName === agent.name;
                  return (
                    <button
                      type="button"
                      key={agent.name}
                      className={`model-picker-item ${isActive ? "active" : ""}`}
                      onClick={() => handleSelectAgent(agent.name)}
                    >
                      <span className="model-picker-item-name">{agent.name}</span>
                      {isActive && <Check size={12} />}
                    </button>
                  );
                })}
                {agentGroups.subagent.length > 0 && (
                  <button
                    type="button"
                    className="model-picker-advanced-toggle"
                    onClick={() => setAdvancedAgentsOpen((open) => !open)}
                  >
                    <ChevronRight size={12} className={advancedAgentsOpen ? "expanded" : ""} />
                    Advanced subagents
                  </button>
                )}
                {advancedAgentsOpen &&
                  agentGroups.subagent.map((agent) => {
                    const isActive = activeAgentName === agent.name;
                    return (
                      <button
                        type="button"
                        key={agent.name}
                        className={`model-picker-item model-picker-item-subagent ${isActive ? "active" : ""}`}
                        onClick={() => handleSelectAgent(agent.name)}
                      >
                        <span className="model-picker-item-name">{agent.name}</span>
                        {isActive && <Check size={12} />}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
          <div className="model-picker-wrapper" ref={modelPickerRef}>
            <button
              type="button"
              className="meta-pill clickable"
              onClick={() => {
                setModelPickerOpen(!modelPickerOpen);
                setAgentPickerOpen(false);
                setAccessPickerOpen(false);
              }}
            >
              <Circle size={10} />
              {activeModelName}
              <ChevronDown size={10} />
            </button>
            {modelPickerOpen && (
              <div className="model-picker">
                <div className="model-picker-header">Select model</div>
                {availableModels(providers).map(({ providerID, models }) => (
                  <div key={providerID} className="model-picker-group">
                    <div className="model-picker-provider">{providerID}</div>
                    {models.map((m) => {
                      const isActive = activeModel?.providerID === providerID && activeModel?.modelID === m.id;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          className={`model-picker-item ${isActive ? "active" : ""}`}
                          onClick={() => handleSelectModel(providerID, m.id)}
                        >
                          <span className="model-picker-item-name">{m.name}</span>
                          {isActive && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="model-picker-wrapper" ref={accessPickerRef}>
            <button
              type="button"
              className="meta-pill clickable"
              onClick={() => {
                setAccessPickerOpen(!accessPickerOpen);
                setModelPickerOpen(false);
                setAgentPickerOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={accessPickerOpen}
            >
              <Zap size={10} />
              full access
              <ChevronDown size={10} />
            </button>
            {accessPickerOpen && (
              <div className="model-picker access-picker">
                <div className="model-picker-header">Access mode</div>
                <button type="button" className="model-picker-item active" onClick={() => setAccessPickerOpen(false)}>
                  <span className="model-picker-item-name">Full access</span>
                  <Check size={12} />
                </button>
                <p className="access-picker-note">Kilo will still request confirmations when needed.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
