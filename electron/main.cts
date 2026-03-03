import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { ChildProcess, spawn, execSync } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import * as pty from "node-pty";

const DEFAULT_PORT = 4100;
const MAX_LOG_ENTRIES = 250;

type DiagnosticsContext = {
  selectedWorkspace?: string | null;
  selectedSessionID?: string | null;
  selectedRuntime?: {
    agentName?: string | null;
    providerID?: string | null;
    modelID?: string | null;
  } | null;
  runtimeError?: string | null;
};

let managedChild: ChildProcess | null = null;
let managedPort = DEFAULT_PORT;
let lastError: string | null = null;
const diagnosticsLog: string[] = [];

function recordLog(level: "info" | "warn" | "error", message: string): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  diagnosticsLog.push(line);
  if (diagnosticsLog.length > MAX_LOG_ENTRIES) {
    diagnosticsLog.splice(0, diagnosticsLog.length - MAX_LOG_ENTRIES);
  }
}

function failInput(message: string): never {
  throw new Error(`Invalid input: ${message}`);
}

function safeString(value: unknown, field: string, maxLength = 1024): string {
  if (typeof value !== "string") failInput(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) failInput(`${field} cannot be empty`);
  if (trimmed.length > maxLength) failInput(`${field} is too long`);
  return trimmed;
}

function safeOptionalString(value: unknown, field: string, maxLength = 1024): string | null {
  if (value == null) return null;
  if (typeof value !== "string") failInput(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) failInput(`${field} is too long`);
  return trimmed;
}

function safePort(value: unknown): number {
  if (value == null) return DEFAULT_PORT;
  if (typeof value !== "number" || !Number.isInteger(value)) failInput("port must be an integer");
  if (value < 1 || value > 65535) failInput("port must be between 1 and 65535");
  return value;
}

function safeTerminalId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    failInput("terminal id must be a positive integer");
  }
  return value;
}

function safeTerminalText(value: unknown): string {
  if (typeof value !== "string") failInput("terminal data must be a string");
  return value.slice(0, 32768);
}

function safeTerminalSize(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) failInput(`${field} must be an integer`);
  if (value < 10 || value > 1000) failInput(`${field} out of range`);
  return value;
}

function safeExternalUrl(value: unknown): string {
  const raw = safeString(value, "url", 2048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    failInput("url must be a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    failInput("url protocol must be http or https");
  }
  return parsed.toString();
}

function safeContext(value: unknown): DiagnosticsContext {
  if (value == null) return {};
  if (typeof value !== "object") failInput("context must be an object");

  const input = value as Record<string, unknown>;
  const runtimeInput =
    typeof input.selectedRuntime === "object" && input.selectedRuntime
      ? (input.selectedRuntime as Record<string, unknown>)
      : null;

  return {
    selectedWorkspace: safeOptionalString(input.selectedWorkspace, "selectedWorkspace", 4096),
    selectedSessionID: safeOptionalString(input.selectedSessionID, "selectedSessionID", 1024),
    selectedRuntime: runtimeInput
      ? {
          agentName: safeOptionalString(runtimeInput.agentName, "selectedRuntime.agentName", 256),
          providerID: safeOptionalString(runtimeInput.providerID, "selectedRuntime.providerID", 256),
          modelID: safeOptionalString(runtimeInput.modelID, "selectedRuntime.modelID", 256),
        }
      : null,
    runtimeError: safeOptionalString(input.runtimeError, "runtimeError", 2048),
  };
}

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
  if (managedChild.exitCode !== null) {
    managedChild = null;
    return false;
  }
  const pid = managedChild.pid;
  if (typeof pid !== "number") {
    managedChild = null;
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    managedChild = null;
    return false;
  }
}

function serverSnapshot() {
  const running = isChildRunning();
  const port = managedPort || DEFAULT_PORT;
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

function stopManagedServer(): void {
  if (!managedChild) return;
  try {
    managedChild.kill();
  } catch {
    recordLog("warn", "Managed server already stopped");
  }
  managedChild = null;
}

function startManagedServer(port: number) {
  if (isChildRunning()) return serverSnapshot();

  const kilo = kiloPath();
  if (!kilo) {
    lastError = "Kilo CLI was not found in PATH";
    throw new Error(lastError);
  }

  const child = spawn(kilo, ["serve", "--port", String(port)], {
    cwd: os.homedir(),
    stdio: "ignore",
    detached: false,
  });

  child.on("error", (err) => {
    lastError = `Failed to start kilo serve: ${err.message}`;
    managedChild = null;
    recordLog("error", lastError);
  });

  child.on("exit", (code, signal) => {
    recordLog("warn", `Managed server exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    managedChild = null;
  });

  managedPort = port;
  managedChild = child;
  lastError = null;
  recordLog("info", `Managed server started on port ${port}`);
  return serverSnapshot();
}

const terminals = new Map<number, pty.IPty>();
let nextTerminalId = 1;

function getDefaultShell(): string {
  if (process.platform === "win32") return "powershell.exe";
  return process.env.SHELL || "/bin/zsh";
}

function killAllTerminals() {
  for (const [id, term] of terminals) {
    try {
      term.kill();
    } catch {
      recordLog("warn", `Terminal ${id} already closed`);
    }
  }
  terminals.clear();
}

function collectDiagnostics(context: DiagnosticsContext) {
  const selectedRuntime =
    context.selectedRuntime?.agentName && context.selectedRuntime?.providerID && context.selectedRuntime?.modelID
      ? {
          agentName: context.selectedRuntime.agentName,
          providerID: context.selectedRuntime.providerID,
          modelID: context.selectedRuntime.modelID,
          updatedAt: Date.now(),
        }
      : null;

  const cliPath = kiloPath();
  return {
    id: randomUUID(),
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    uptimeMs: Math.round(process.uptime() * 1000),
    homeDirectory: os.homedir(),
    server: serverSnapshot(),
    cli: {
      installed: cliPath !== null,
      path: cliPath,
      version: commandOutput("kilo --version"),
    },
    selectedWorkspace: context.selectedWorkspace ?? null,
    selectedSessionID: context.selectedSessionID ?? null,
    selectedRuntime,
    runtimeError: context.runtimeError ?? null,
    errors: diagnosticsLog
      .filter((line) => line.includes("[ERROR]"))
      .map((line) => ({
        at: line.slice(0, 24),
        category: "unknown",
        message: line,
      })),
    recentLogs: [...diagnosticsLog],
  };
}

async function exportDiagnosticsZip(context: DiagnosticsContext) {
  const snapshot = collectDiagnostics(context);
  const zip = new JSZip();
  zip.file("snapshot.json", JSON.stringify(snapshot, null, 2));
  zip.file("logs.txt", snapshot.recentLogs.join("\n"));

  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const dir = path.join(app.getPath("userData"), "diagnostics");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `kiloapp-diagnostics-${snapshot.id}.zip`);
  await fs.writeFile(filePath, data);
  recordLog("info", `Diagnostics zip exported: ${filePath}`);
  return { id: snapshot.id, filePath };
}

function registerIPC() {
  ipcMain.on("debug:log", (_event, message) => {
    console.log(`[RENDERER] ${message}`);
  });

  ipcMain.handle("kilo:get-cli-info", () => {
    const kp = kiloPath();
    const version = commandOutput("kilo --version");
    return { installed: kp !== null, path: kp, version };
  });

  ipcMain.handle("kilo:get-home-directory", () => os.homedir());

  ipcMain.handle("kilo:start-server", (_event, port) => {
    const safe = safePort(port);
    return startManagedServer(safe);
  });

  ipcMain.handle("kilo:stop-server", () => {
    stopManagedServer();
    return serverSnapshot();
  });

  ipcMain.handle("kilo:get-server-state", () => serverSnapshot());

  ipcMain.handle("shell:open-external", (_event, rawUrl) => {
    const url = safeExternalUrl(rawUrl);
    recordLog("info", `Opening external URL: ${url}`);
    return shell.openExternal(url);
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "multiSelections"],
    });
    if (result.canceled) return null;
    return result.filePaths.filter((filePath) => path.isAbsolute(filePath));
  });

  ipcMain.handle("diagnostics:collect", (_event, rawContext) => {
    const context = safeContext(rawContext);
    return collectDiagnostics(context);
  });

  ipcMain.handle("diagnostics:export-zip", async (_event, rawContext) => {
    const context = safeContext(rawContext);
    return exportDiagnosticsZip(context);
  });

  ipcMain.handle("diagnostics:open-folder", (_event, rawPath) => {
    const filePath = safeString(rawPath, "filePath", 4096);
    if (!path.isAbsolute(filePath)) failInput("filePath must be absolute");
    shell.showItemInFolder(filePath);
  });
}

function registerTerminalIPC() {
  ipcMain.handle("terminal:create", (event) => {
    const id = nextTerminalId++;
    const shellPath = getDefaultShell();
    const term = pty.spawn(shellPath, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: process.env as Record<string, string>,
    });

    terminals.set(id, term);
    recordLog("info", `Terminal created: ${id}`);

    term.onData((data: string) => {
      try {
        event.sender.send("terminal:data", id, data);
      } catch {
        recordLog("warn", `Terminal data dropped for ${id} because renderer is unavailable`);
      }
    });

    term.onExit(() => {
      terminals.delete(id);
      recordLog("info", `Terminal exited: ${id}`);
      try {
        event.sender.send("terminal:exit", id);
      } catch {
        recordLog("warn", `Terminal exit event dropped for ${id}`);
      }
    });

    return id;
  });

  ipcMain.handle("terminal:write", (_event, rawId, rawData) => {
    const id = safeTerminalId(rawId);
    const data = safeTerminalText(rawData);
    const term = terminals.get(id);
    if (!term) return;
    term.write(data);
  });

  ipcMain.handle("terminal:resize", (_event, rawId, rawCols, rawRows) => {
    const id = safeTerminalId(rawId);
    const cols = safeTerminalSize(rawCols, "cols");
    const rows = safeTerminalSize(rawRows, "rows");
    const term = terminals.get(id);
    if (!term) return;
    term.resize(cols, rows);
  });

  ipcMain.handle("terminal:close", (_event, rawId) => {
    const id = safeTerminalId(rawId);
    const term = terminals.get(id);
    if (!term) return;
    term.kill();
    terminals.delete(id);
    recordLog("info", `Terminal closed: ${id}`);
  });
}

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
    return;
  }
  win.loadFile(path.join(__dirname, "../dist/index.html"));
}

function shutdownManagedResources() {
  killAllTerminals();
  stopManagedServer();
}

app.whenReady().then(() => {
  registerIPC();
  registerTerminalIPC();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  recordLog("info", "App before-quit received");
  shutdownManagedResources();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
