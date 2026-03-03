import type { AppErrorCategory } from "./types";

export type AppErrorInfo = {
  category: AppErrorCategory;
  message: string;
};

function cleanMessage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Unknown error";
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 237)}...`;
}

export function mapError(reason: unknown): AppErrorInfo {
  const message = cleanMessage(reason instanceof Error ? reason.message : String(reason));
  const lower = message.toLowerCase();

  if (lower.includes("kilo cli") && lower.includes("not found")) {
    return { category: "cli_missing", message: "Kilo CLI was not found. Install Kilo CLI and restart KiloApp." };
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("auth") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    return { category: "auth_required", message: "Kilo authentication is required. Run `kilo auth login` and reconnect." };
  }

  if (
    lower.includes("rejected runtime override") ||
    lower.includes("unsupported agent") ||
    lower.includes("unknown agent") ||
    lower.includes("invalid agent")
  ) {
    return { category: "agent_unsupported", message: "Selected agent is not supported by this Kilo server." };
  }

  if (
    lower.includes("model unavailable") ||
    lower.includes("unknown model") ||
    lower.includes("invalid model") ||
    lower.includes("provider")
  ) {
    return { category: "model_unavailable", message: "Selected model is unavailable. KiloApp switched to a compatible model." };
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("offline") ||
    lower.includes("timed out") ||
    lower.includes("server")
  ) {
    return { category: "server_unreachable", message: "Kilo server is unreachable. Try restart server or reconnect." };
  }

  if (lower.includes("request failed") || lower.includes("invalid json")) {
    return { category: "api_error", message };
  }

  return { category: "unknown", message };
}
