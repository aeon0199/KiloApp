import type {
  Agent,
  AgentCompatibility,
  AgentMode,
  AgentRuntimeState,
  MessagePart,
  ModelInfo,
  ProviderListResponse,
} from "./types";

export function formatTime(timestamp?: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(timestamp?: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

export function pathName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return path;
  return parts[parts.length - 1];
}

export function partText(part: MessagePart): string {
  if (part.type === "text" && typeof part.text === "string") return part.text;
  return "";
}

export function toolState(part: MessagePart): { name: string; status: string } | null {
  if (part.type !== "tool") return null;
  const name = typeof part.tool === "string" ? part.tool : "tool";
  const status =
    typeof part.state === "object" && part.state && "status" in part.state ? String(part.state.status) : "running";
  return { name, status };
}

export function normalizeAgentMode(mode?: string): AgentMode {
  if (mode === "primary") return "primary";
  if (mode === "subagent") return "subagent";
  return "unknown";
}

export function splitAgentsByMode(agents: Agent[]): { primary: Agent[]; subagent: Agent[]; unknown: Agent[] } {
  const primary: Agent[] = [];
  const subagent: Agent[] = [];
  const unknown: Agent[] = [];

  for (const agent of agents) {
    const mode = normalizeAgentMode(agent.mode);
    if (mode === "primary") {
      primary.push(agent);
      continue;
    }
    if (mode === "subagent") {
      subagent.push(agent);
      continue;
    }
    unknown.push(agent);
  }

  return { primary, subagent, unknown };
}

export function defaultAgentName(agents: Agent[], preferred = "code"): string {
  if (agents.some((agent) => agent.name === preferred)) return preferred;
  const primary = agents.find((agent) => normalizeAgentMode(agent.mode) === "primary");
  if (primary) return primary.name;
  if (agents[0]) return agents[0].name;
  return preferred;
}

export function modelExists(providers: ProviderListResponse | null, providerID: string, modelID: string): boolean {
  if (!providers) return false;
  const provider = providers.all.find((entry) => entry.id === providerID);
  if (!provider) return false;
  return !!provider.models[modelID];
}

export function firstAvailableModel(
  providers: ProviderListResponse | null,
): { providerID: string; modelID: string; modelName: string } | null {
  if (!providers) return null;
  for (const providerID of providers.connected) {
    const provider = providers.all.find((entry) => entry.id === providerID);
    if (!provider) continue;
    const firstModel = Object.values(provider.models)[0];
    if (!firstModel) continue;
    return {
      providerID,
      modelID: firstModel.id,
      modelName: firstModel.name || firstModel.id,
    };
  }
  return null;
}

export function currentModel(
  providers: ProviderListResponse | null,
  preferredProviderID?: string,
): { providerID: string; modelID: string; modelName: string } | null {
  if (!providers) return null;
  const providerCandidates = preferredProviderID
    ? [preferredProviderID, ...providers.connected.filter((pid) => pid !== preferredProviderID), ...Object.keys(providers.default)]
    : [...providers.connected, ...Object.keys(providers.default)];

  for (const providerID of providerCandidates) {
    const provider = providers.all.find((entry) => entry.id === providerID);
    if (!provider) continue;
    const configuredModelID = providers.default[providerID];
    if (configuredModelID && provider.models[configuredModelID]) {
      return {
        providerID,
        modelID: configuredModelID,
        modelName: provider.models[configuredModelID].name || configuredModelID,
      };
    }

    const firstModel = Object.values(provider.models)[0];
    if (!firstModel) continue;
    return {
      providerID,
      modelID: firstModel.id,
      modelName: firstModel.name || firstModel.id,
    };
  }

  return null;
}

export function modelLabel(providers: ProviderListResponse | null, preferredProviderID?: string): string {
  const model = currentModel(providers, preferredProviderID);
  return model ? model.modelName : "no model";
}

export function availableModels(
  providers: ProviderListResponse | null,
): { providerID: string; models: ModelInfo[] }[] {
  if (!providers) return [];
  return providers.connected.map((pid) => {
    const provider = providers.all.find((p) => p.id === pid);
    const models = provider ? Object.values(provider.models) : [];
    return { providerID: pid, models };
  });
}

export function runtimeModelName(
  providers: ProviderListResponse | null,
  runtime: Pick<AgentRuntimeState, "providerID" | "modelID"> | null,
): string {
  if (!runtime || !providers) return "no model";
  const provider = providers.all.find((entry) => entry.id === runtime.providerID);
  if (!provider) return runtime.modelID || "no model";
  return provider.models[runtime.modelID]?.name || runtime.modelID || "no model";
}

export function runtimeCompatibility(
  agents: Agent[],
  providers: ProviderListResponse | null,
  runtime: AgentRuntimeState | null,
): AgentCompatibility {
  if (!runtime) return "ok";
  if (!agents.some((agent) => agent.name === runtime.agentName)) return "agent_unavailable";
  if (!runtime.providerID || !runtime.modelID) return "ok";
  if (!providers) return "ok";
  if (!modelExists(providers, runtime.providerID, runtime.modelID)) return "model_missing";
  return "ok";
}
