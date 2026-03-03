import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  kilo: {
    getCliInfo: () =>
      ipcRenderer.invoke("kilo:get-cli-info"),
    getHomeDirectory: (): Promise<string> =>
      ipcRenderer.invoke("kilo:get-home-directory"),
    startServer: (port?: number) =>
      ipcRenderer.invoke("kilo:start-server", port),
    stopServer: () =>
      ipcRenderer.invoke("kilo:stop-server"),
    getServerState: () =>
      ipcRenderer.invoke("kilo:get-server-state"),
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke("shell:open-external", url),
  },
  dialog: {
    openDirectory: (): Promise<string[] | null> =>
      ipcRenderer.invoke("dialog:open-directory"),
  },
  debug: {
    log: (message: string) => ipcRenderer.send("debug:log", message),
  },
  diagnostics: {
    collect: (context?: {
      selectedWorkspace?: string | null;
      selectedSessionID?: string | null;
      selectedRuntime?: { agentName?: string | null; providerID?: string | null; modelID?: string | null } | null;
      runtimeError?: string | null;
    }) =>
      ipcRenderer.invoke("diagnostics:collect", context),
    exportZip: (context?: {
      selectedWorkspace?: string | null;
      selectedSessionID?: string | null;
      selectedRuntime?: { agentName?: string | null; providerID?: string | null; modelID?: string | null } | null;
      runtimeError?: string | null;
    }) =>
      ipcRenderer.invoke("diagnostics:export-zip", context),
    openFolder: (filePath: string): Promise<void> =>
      ipcRenderer.invoke("diagnostics:open-folder", filePath),
  },
  terminal: {
    create: (): Promise<number> =>
      ipcRenderer.invoke("terminal:create"),
    write: (id: number, data: string): Promise<void> =>
      ipcRenderer.invoke("terminal:write", id, data),
    resize: (id: number, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke("terminal:resize", id, cols, rows),
    close: (id: number): Promise<void> =>
      ipcRenderer.invoke("terminal:close", id),
    onData: (callback: (id: number, data: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: number, data: string) => callback(id, data);
      ipcRenderer.on("terminal:data", listener);
      return () => { ipcRenderer.removeListener("terminal:data", listener); };
    },
    onExit: (callback: (id: number) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: number) => callback(id);
      ipcRenderer.on("terminal:exit", listener);
      return () => { ipcRenderer.removeListener("terminal:exit", listener); };
    },
  },
});
