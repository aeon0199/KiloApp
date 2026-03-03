import type { DiagnosticSnapshot, KiloCliInfo, KiloServerState } from "./types";

type DiagnosticsContext = {
  selectedWorkspace?: string | null;
  selectedSessionID?: string | null;
  selectedRuntime?: { agentName?: string | null; providerID?: string | null; modelID?: string | null } | null;
  runtimeError?: string | null;
};

interface ElectronTerminalAPI {
  create(): Promise<number>;
  write(id: number, data: string): Promise<void>;
  resize(id: number, cols: number, rows: number): Promise<void>;
  close(id: number): Promise<void>;
  onData(callback: (id: number, data: string) => void): () => void;
  onExit(callback: (id: number) => void): () => void;
}

interface ElectronAPI {
  kilo: {
    getCliInfo(): Promise<KiloCliInfo>;
    getHomeDirectory(): Promise<string>;
    startServer(port?: number): Promise<KiloServerState>;
    stopServer(): Promise<KiloServerState>;
    getServerState(): Promise<KiloServerState>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  dialog: {
    openDirectory(): Promise<string[] | null>;
  };
  debug: {
    log(message: string): void;
  };
  diagnostics: {
    collect(context?: DiagnosticsContext): Promise<DiagnosticSnapshot>;
    exportZip(context?: DiagnosticsContext): Promise<{ id: string; filePath: string }>;
    openFolder(filePath: string): Promise<void>;
  };
  terminal: ElectronTerminalAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
