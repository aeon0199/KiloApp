import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  openExternal: (url: string) =>
    ipcRenderer.invoke("shell:open-external", url),
  openDirectoryDialog: () =>
    ipcRenderer.invoke("dialog:open-directory"),
});
