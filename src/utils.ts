import type { MessagePart, ModelInfo, ProviderListResponse } from "./types";

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

export function currentModel(
  providers: ProviderListResponse | null,
): { providerID: string; modelID: string; modelName: string } | null {
  if (!providers) return null;
  const providerID = providers.connected[0] || Object.keys(providers.default)[0];
  if (!providerID) return null;
  const modelID = providers.default[providerID];
  if (!modelID) return null;
  const provider = providers.all.find((p) => p.id === providerID);
  const modelInfo = provider?.models[modelID];
  return { providerID, modelID, modelName: modelInfo?.name || modelID };
}

export function modelLabel(providers: ProviderListResponse | null): string {
  const model = currentModel(providers);
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
