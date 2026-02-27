interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  openExternal(url: string): Promise<void>;
  openDirectoryDialog(): Promise<string[] | null>;
}

interface Window {
  electron: ElectronAPI;
}
