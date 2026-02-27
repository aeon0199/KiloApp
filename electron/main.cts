import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { ChildProcess, spawn, execSync } from "child_process";
import * as path from "path";
import * as os from "os";

// ── Managed server state ─────────────────────────────────────────
let managedChild: ChildProcess | null = null;
let managedPort = 4100;
let lastError: string | null = null;

function kiloPath(): string | null {
  try {
    return execSync("sh -lc 'command -v kilo'", { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

function commandOutput(cmd: string): string | null {
  try {
    const out = execSync(`sh -lc '${cmd}'`, { encoding: "utf-8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function isChildRunning(): boolean {
  if (!managedChild) return false;
  // If exitCode is set, the process has exited
  if (managedChild.exitCode !== null) {
    managedChild = null;
    return false;
  }
  try {
    // Signal 0 tests if process exists without killing it
    process.kill(managedChild.pid!, 0);
    return true;
  } catch {
    managedChild = null;
    return false;
  }
}

function serverSnapshot() {
  const running = isChildRunning();
  const port = managedPort || 4100;
  return {
    managed: managedChild !== null,
    running,
    port,
    url: `http://127.0.0.1:${port}`,
    pid: managedChild?.pid ?? null,
    kiloPath: kiloPath(),
    lastError,
  };
}

// ── IPC Handlers ─────────────────────────────────────────────────
function registerIPC() {
  ipcMain.handle("kilo:cli-info", () => {
    const kp = kiloPath();
    const version = commandOutput("kilo --version");
    return { installed: kp !== null, path: kp, version };
  });

  ipcMain.handle("kilo:home-directory", () => os.homedir());

  ipcMain.handle("kilo:start-server", (_event, port: number) => {
    if (isChildRunning()) return serverSnapshot();

    const kilo = kiloPath();
    if (!kilo) throw new Error("Kilo CLI was not found in PATH");

    const selectedPort = port || 4100;
    const child = spawn(kilo, ["serve", "--port", String(selectedPort)], {
      cwd: os.homedir(),
      stdio: "ignore",
      detached: false,
    });

    child.on("error", (err) => {
      lastError = `Failed to start kilo serve: ${err.message}`;
      managedChild = null;
    });

    managedPort = selectedPort;
    managedChild = child;
    lastError = null;
    return serverSnapshot();
  });

  ipcMain.handle("kilo:stop-server", () => {
    if (managedChild) {
      try {
        managedChild.kill();
      } catch { /* already dead */ }
      managedChild = null;
    }
    return serverSnapshot();
  });

  ipcMain.handle("kilo:server-state", () => serverSnapshot());

  ipcMain.handle("shell:open-external", (_event, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "multiSelections"],
    });
    if (result.canceled) return null;
    return result.filePaths;
  });
}

// ── Window ───────────────────────────────────────────────────────
function createWindow() {
  const preload = path.join(__dirname, "preload.cjs");

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 20 },
    transparent: true,
    vibrancy: "under-window",
    roundedCorners: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ── App lifecycle ────────────────────────────────────────────────
app.whenReady().then(() => {
  registerIPC();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Kill managed server on quit
  if (managedChild) {
    try { managedChild.kill(); } catch { /* ignore */ }
    managedChild = null;
  }
  if (process.platform !== "darwin") app.quit();
});
