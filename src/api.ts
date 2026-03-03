import type {
  Agent,
  CloudSessionsResponse,
  HealthResponse,
  KiloNotification,
  KiloProfile,
  MessageWithParts,
  OAuthAuthorizeResponse,
  PermissionRequest,
  ProjectInfo,
  ProviderEntry,
  ProviderListResponse,
  QuestionRequest,
  SessionInfo,
  SessionStatusInfo,
  RuntimeSelection,
} from "./types";

// Helper to log to both console and terminal
function debugLog(...args: unknown[]) {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log('[DEBUG]', message);
  window.electron?.debug?.log(message);
}

type RequestInput = {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  directory?: string;
  body?: unknown;
};

type RuntimeFallbackCallback = (message: string) => void;

export class KiloApi {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(input: RequestInput): Promise<T> {
    const headers: Record<string, string> = {};
    if (input.directory) {
      headers["x-opencode-directory"] = input.directory;
    }
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    });
    debugLog('API request:', input.method ?? 'GET', input.path, 'body:', input.body);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Request failed (${response.status}): ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Invalid JSON response from ${input.path}`);
    }
  }

  private runtimeFields(runtime?: RuntimeSelection): Record<string, unknown> {
    if (!runtime) return {};
    const fields: Record<string, unknown> = {};
    if (runtime.agent) {
      debugLog('runtimeFields adding agent:', runtime.agent);
      fields.agent = runtime.agent;
    }
    if (runtime.modelID) {
      fields.model = {
        providerID: runtime.providerID || "kilo",
        modelID: runtime.modelID,
      };
    }
    return fields;
  }

  private shouldRetryRuntimeFallback(reason: unknown): boolean {
    const message = reason instanceof Error ? reason.message : String(reason);
    const lower = message.toLowerCase();
    const status = Number((/request failed \((\d+)\)/i.exec(lower) || [])[1] || 0);
    const retryableStatus = status === 400 || status === 404 || status === 422;
    if (!retryableStatus) return false;
    const runtimeHints = ["agent", "model", "provider", "unknown", "unexpected", "invalid", "property", "field"];
    return runtimeHints.some((hint) => lower.includes(hint));
  }

  private async requestWithRuntimeFallback<T>(
    runtime: RuntimeSelection | undefined,
    onRuntimeFallback: RuntimeFallbackCallback | undefined,
    requestWithRuntime: () => Promise<T>,
    requestWithoutRuntime: () => Promise<T>,
  ): Promise<T> {
    if (!runtime) return requestWithRuntime();
    try {
      return await requestWithRuntime();
    } catch (reason) {
      if (!this.shouldRetryRuntimeFallback(reason)) throw reason;
      onRuntimeFallback?.("Kilo server rejected runtime override. Retrying with server defaults.");
      return requestWithoutRuntime();
    }
  }

  // ── Health ──────────────────────────────────────────────────────
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>({ path: "/global/health" });
  }

  // ── Sessions ────────────────────────────────────────────────────
  async listSessions(directory: string) {
    const query = new URLSearchParams({ directory, limit: "50" });
    return this.request<SessionInfo[]>({ path: `/session?${query.toString()}` });
  }

  async createSession(
    directory: string,
    title?: string,
    runtime?: RuntimeSelection,
    onRuntimeFallback?: RuntimeFallbackCallback,
  ) {
    const baseBody = title ? { title } : {};
    const withRuntime = () =>
      this.request<SessionInfo>({
        path: "/session",
        method: "POST",
        directory,
        body: { ...baseBody, ...this.runtimeFields(runtime) },
      });
    const withoutRuntime = () =>
      this.request<SessionInfo>({
        path: "/session",
        method: "POST",
        directory,
        body: baseBody,
      });
    return this.requestWithRuntimeFallback(runtime, onRuntimeFallback, withRuntime, withoutRuntime);
  }

  async listMessages(directory: string, sessionID: string) {
    return this.request<MessageWithParts[]>({
      path: `/session/${sessionID}/message`,
      directory,
    });
  }

  async prompt(
    directory: string,
    sessionID: string,
    prompt: string,
    runtime?: RuntimeSelection,
    onRuntimeFallback?: RuntimeFallbackCallback,
  ) {
    debugLog('api.prompt called with runtime:', runtime);
    const withRuntime = () =>
      this.request<{ info: unknown; parts: unknown[] }>({
        path: `/session/${sessionID}/message`,
        method: "POST",
        directory,
        body: {
          parts: [{ type: "text", text: prompt }],
          ...this.runtimeFields(runtime),
        },
      });
    const withoutRuntime = () =>
      this.request<{ info: unknown; parts: unknown[] }>({
        path: `/session/${sessionID}/message`,
        method: "POST",
        directory,
        body: { parts: [{ type: "text", text: prompt }] },
      });
    return this.requestWithRuntimeFallback(runtime, onRuntimeFallback, withRuntime, withoutRuntime);
  }

  async sessionStatus(directory: string) {
    return this.request<Record<string, SessionStatusInfo>>({
      path: "/session/status",
      directory,
    });
  }

  async abortSession(directory: string, sessionID: string) {
    return this.request<boolean>({
      path: `/session/${sessionID}/abort`,
      method: "POST",
      directory,
      body: {},
    });
  }

  async renameSession(directory: string, sessionID: string, title: string) {
    return this.request<SessionInfo>({
      path: `/session/${sessionID}`,
      method: "PATCH",
      directory,
      body: { title },
    });
  }

  async forkSession(directory: string, sessionID: string) {
    return this.request<SessionInfo>({
      path: `/session/${sessionID}/fork`,
      method: "POST",
      directory,
      body: {},
    });
  }

  async deleteSession(directory: string, sessionID: string) {
    return this.request<void>({
      path: `/session/${sessionID}`,
      method: "DELETE",
      directory,
    });
  }

  async compactSession(directory: string, sessionID: string) {
    return this.request<void>({
      path: `/session/${sessionID}/compact`,
      method: "POST",
      directory,
      body: {},
    });
  }

  // ── Projects ────────────────────────────────────────────────────
  async listProjects() {
    return this.request<ProjectInfo[]>({ path: "/project" });
  }

  // ── Providers + Models ──────────────────────────────────────────
  async listProviders(directory?: string) {
    return this.request<ProviderListResponse>({
      path: "/provider",
      directory,
    });
  }

  async changeModel(modelID: string, directory?: string) {
    return this.request<unknown>({
      path: "/config",
      method: "PATCH",
      directory,
      body: { model: modelID },
    });
  }

  async listConfigProviders(directory?: string) {
    const data = await this.request<{ providers: ProviderEntry[]; default: Record<string, string> }>({
      path: "/config/providers",
      directory,
    });
    // Map to ProviderListResponse shape so downstream code works unchanged
    return {
      all: data.providers,
      default: data.default,
      connected: data.providers.map((p) => p.id),
    } as ProviderListResponse;
  }

  async listProviderAuth() {
    return this.request<Record<string, Array<{ type: string; label: string }>>>({
      path: "/provider/auth",
    });
  }

  async authorizeProvider(providerId: string, method: number = 0) {
    return this.request<OAuthAuthorizeResponse>({
      path: `/provider/${providerId}/oauth/authorize`,
      method: "POST",
      body: { method },
    });
  }

  async oauthCallback(providerId: string, method: number = 0, code?: string) {
    return this.request<boolean>({
      path: `/provider/${providerId}/oauth/callback`,
      method: "POST",
      body: { method, code },
    });
  }

  // ── Kilo Gateway (profile, cloud, notifications) ────────────────
  async getProfile() {
    return this.request<KiloProfile>({ path: "/kilo/profile" });
  }

  async listCloudSessions(cursor?: string, limit = 20) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return this.request<CloudSessionsResponse>({
      path: `/kilo/cloud-sessions?${params.toString()}`,
    });
  }

  async importCloudSession(sessionId: string) {
    return this.request<SessionInfo>({
      path: "/kilo/cloud/session/import",
      method: "POST",
      body: { sessionId },
    });
  }

  async listNotifications() {
    return this.request<KiloNotification[]>({ path: "/kilo/notifications" });
  }

  // ── Agents ──────────────────────────────────────────────────────
  async listAgents() {
    const data = await this.request<Agent[]>({ path: "/agent" });
    return data
      .map((agent) => ({
        ...agent,
        mode: agent.mode === "primary" || agent.mode === "subagent" ? agent.mode : "unknown",
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  // ── Permissions + Questions ─────────────────────────────────────
  async listPermissions() {
    return this.request<PermissionRequest[]>({ path: "/permission" });
  }

  async replyPermission(requestId: string, reply: string, message?: string) {
    return this.request<boolean>({
      path: `/permission/${requestId}/reply`,
      method: "POST",
      body: { reply, message },
    });
  }

  async listQuestions() {
    return this.request<QuestionRequest[]>({ path: "/question" });
  }

  async replyQuestion(requestId: string, answers: Record<string, string>) {
    return this.request<boolean>({
      path: `/question/${requestId}/reply`,
      method: "POST",
      body: { answers },
    });
  }

  async rejectQuestion(requestId: string) {
    return this.request<boolean>({
      path: `/question/${requestId}/reject`,
      method: "POST",
    });
  }

  // ── Config ──────────────────────────────────────────────────────
  async getConfig() {
    return this.request<Record<string, unknown>>({ path: "/config" });
  }

  // ── Commit Message ──────────────────────────────────────────────
  async generateCommitMessage(path: string, selectedFiles?: string[]) {
    return this.request<{ message: string }>({
      path: "/commit-message",
      method: "POST",
      body: { path, selectedFiles },
    });
  }
}
