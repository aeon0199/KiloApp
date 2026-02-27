import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Send, Activity, Zap, Circle, ChevronDown, Check } from "lucide-react";
import type { ProviderListResponse } from "./types";
import { currentModel, modelLabel, availableModels } from "./utils";

type ComposerProps = {
  composer: string;
  setComposer: (value: string) => void;
  busy: boolean;
  providers: ProviderListResponse | null;
  onSubmit: (e: FormEvent) => void;
  onAbort: () => void;
  onSelectModel: (providerID: string, modelID: string) => void;
};

export function Composer({ composer, setComposer, busy, providers, onSubmit, onAbort, onSelectModel }: ComposerProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "24px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  useEffect(() => { autoGrow(); }, [composer, autoGrow]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelPickerOpen]);

  function handleSelectModel(providerID: string, modelID: string) {
    onSelectModel(providerID, modelID);
    setModelPickerOpen(false);
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="composer-input">
        <textarea
          ref={textareaRef}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Ask Kilo to build, debug, or refactor..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (composer.trim()) onSubmit(e as unknown as FormEvent);
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
      <div className="composer-bar">
        <div className="composer-meta">
          <div className="model-picker-wrapper" ref={modelPickerRef}>
            <button
              type="button"
              className="meta-pill clickable"
              onClick={() => setModelPickerOpen(!modelPickerOpen)}
            >
              <Circle size={10} />
              {modelLabel(providers)}
              <ChevronDown size={10} />
            </button>
            {modelPickerOpen && (
              <div className="model-picker">
                <div className="model-picker-header">Select model</div>
                {availableModels(providers).map(({ providerID, models }) => (
                  <div key={providerID} className="model-picker-group">
                    <div className="model-picker-provider">{providerID}</div>
                    {models.map((m) => {
                      const cur = currentModel(providers);
                      const isActive = cur?.providerID === providerID && cur?.modelID === m.id;
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
          <span className="meta-pill"><Activity size={10} />{busy ? "running" : "idle"}</span>
          <span className="meta-pill"><Zap size={10} />full access</span>
        </div>
      </div>
    </form>
  );
}
