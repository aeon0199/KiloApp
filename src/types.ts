export type SessionStatusInfo =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

export type SessionInfo = {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;
  };
};

export type ProjectInfo = {
  id: string;
  worktree: string;
  vcs?: string;
  time?: {
    created: number;
    updated: number;
  };
};

export type MessageInfo = {
  id: string;
  role: "user" | "assistant";
  sessionID: string;
  modelID?: string;
  agent?: string;
  time?: {
    created?: number;
    completed?: number;
  };
};

export type TextPart = {
  type: "text";
  text: string;
};

export type ReasoningPart = {
  type: "reasoning";
  text: string;
};

export type ToolPart = {
  type: "tool";
  tool: string;
  state?: {
    status?: string;
    [key: string]: unknown;
  };
};

export type GenericPart = {
  type: string;
  [key: string]: unknown;
};

export type MessagePart = TextPart | ReasoningPart | ToolPart | GenericPart;

export type MessageWithParts = {
  info: MessageInfo;
  parts: MessagePart[];
};

export type KiloCliInfo = {
  installed: boolean;
  path?: string | null;
  version?: string | null;
};

export type KiloServerState = {
  managed: boolean;
  running: boolean;
  port: number;
  url: string;
  pid?: number | null;
  kiloPath?: string | null;
  lastError?: string | null;
};

export type ModelInfo = {
  id: string;
  providerID: string;
  name: string;
  family?: string;
};

export type ProviderEntry = {
  id: string;
  name?: string;
  source?: string;
  models: Record<string, ModelInfo>;
};

export type ProviderListResponse = {
  all: ProviderEntry[];
  default: Record<string, string>;
  connected: string[];
};

// ── Health ──────────────────────────────────────────────────────
export type HealthResponse = {
  healthy: boolean;
  version: string;
};

// ── Profile ─────────────────────────────────────────────────────
export type KiloProfile = {
  profile?: {
    id?: string;
    username?: string;
    email?: string;
  };
  balance?: number;
  currentOrgId?: string | null;
};

// ── Cloud Sessions ──────────────────────────────────────────────
export type CloudSessionEntry = {
  id: string;
  title?: string;
  directory?: string;
  device?: string;
  time?: { created: number; updated: number };
};

export type CloudSessionsResponse = {
  cliSessions: CloudSessionEntry[];
  nextCursor: string | null;
};

// ── Agents ──────────────────────────────────────────────────────
export type Agent = {
  name: string;
  description: string;
  mode?: string;
  native?: boolean;
  options?: Record<string, unknown>;
  permission?: Array<{
    permission: string;
    action: string;
    pattern: string;
  }>;
};

// ── Permissions ─────────────────────────────────────────────────
export type PermissionRequest = {
  id: string;
  sessionID?: string;
  tool?: string;
  args?: Record<string, unknown>;
  description?: string;
  time?: number;
};

// ── Questions ───────────────────────────────────────────────────
export type QuestionRequest = {
  id: string;
  sessionID?: string;
  text?: string;
  options?: string[];
  time?: number;
};

// ── Notifications ───────────────────────────────────────────────
export type KiloNotification = {
  id: string;
  type?: string;
  message?: string;
  read?: boolean;
  time?: number;
};

// ── Tool Activity ───────────────────────────────────────────────
export type ToolActivity = {
  id: string;
  tool: string;
  status: string;
  input?: Record<string, unknown>;
  output?: string;
  metadata?: Record<string, unknown>;
};

// ── SSE Events ──────────────────────────────────────────────────
export type SSEPayload = {
  type: string;
  properties: Record<string, unknown>;
};

// ── OAuth ───────────────────────────────────────────────────────
export type OAuthAuthorizeResponse = {
  url: string;
  method?: number;
  [key: string]: unknown;
};
