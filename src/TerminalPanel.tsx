import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { ChevronUp, ChevronDown, TerminalSquare, RotateCcw, Eraser } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

type TerminalPanelProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function TerminalPanel({ collapsed, onToggleCollapse }: TerminalPanelProps) {
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const [starting, setStarting] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const webglLoadedRef = useRef(false);
  const terminalIdRef = useRef<number | null>(null);
  const createInFlightRef = useRef<Promise<void> | null>(null);
  const lifecycleTokenRef = useRef(0);
  const autoRestartAttemptsRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current === null) return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const teardownTerminal = useCallback((closeRemote: boolean) => {
    const currentId = terminalIdRef.current;

    if (inputDisposableRef.current) {
      inputDisposableRef.current.dispose();
      inputDisposableRef.current = null;
    }

    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }

    fitRef.current = null;
    webglLoadedRef.current = false;
    terminalIdRef.current = null;
    setTerminalId(null);

    if (!closeRemote || currentId === null) return;
    window.electron.terminal.close(currentId).catch(() => {
      // Ignore close races during shutdown.
    });
  }, []);

  const spawnTerminal = useCallback(async () => {
    if (terminalIdRef.current !== null) {
      setStarting(false);
      return;
    }

    if (createInFlightRef.current) {
      await createInFlightRef.current;
      return;
    }

    const token = ++lifecycleTokenRef.current;
    const createPromise = (async () => {
      setStarting(true);
      const id = await window.electron.terminal.create();

      if (token !== lifecycleTokenRef.current) {
        await window.electron.terminal.close(id).catch(() => {});
        return;
      }

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', Menlo, Monaco, Consolas, monospace",
        lineHeight: 1.28,
        theme: {
          background: "transparent",
          foreground: "#e6e7ea",
          cursor: "#FFE44D",
          selectionBackground: "rgba(74, 158, 255, 0.3)",
          black: "#1a1a2e",
          red: "#ff6e6e",
          green: "#78ebbd",
          yellow: "#FFE44D",
          blue: "#4A9EFF",
          magenta: "#c792ea",
          cyan: "#89ddff",
          white: "#e6e7ea",
          brightBlack: "#545478",
          brightRed: "#ff8a8a",
          brightGreen: "#98f5d4",
          brightYellow: "#fff176",
          brightBlue: "#82c4ff",
          brightMagenta: "#dab6fc",
          brightCyan: "#a6e8ff",
          brightWhite: "#ffffff",
        },
        allowTransparency: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      inputDisposableRef.current = term.onData((data) => {
        window.electron.terminal.write(id, data);
      });

      autoRestartAttemptsRef.current = 0;
      clearRestartTimer();
      terminalIdRef.current = id;
      termRef.current = term;
      fitRef.current = fit;
      setTerminalId(id);
      setStarting(false);
    })().catch(() => {
      if (token !== lifecycleTokenRef.current) return;
      setStarting(false);
    }).finally(() => {
      createInFlightRef.current = null;
    });

    createInFlightRef.current = createPromise;
    await createPromise;
  }, [clearRestartTimer]);

  const queueAutoRestart = useCallback(() => {
    if (autoRestartAttemptsRef.current >= 2) {
      setStarting(false);
      return;
    }
    if (restartTimerRef.current !== null) return;
    autoRestartAttemptsRef.current += 1;
    setStarting(true);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (terminalIdRef.current !== null) return;
      void spawnTerminal();
    }, 220);
  }, [spawnTerminal]);

  useEffect(() => {
    const unsubData = window.electron.terminal.onData((id, data) => {
      if (id !== terminalIdRef.current) return;
      termRef.current?.write(data);
    });

    const unsubExit = window.electron.terminal.onExit((id) => {
      if (id !== terminalIdRef.current) return;
      teardownTerminal(false);
      queueAutoRestart();
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, [queueAutoRestart, teardownTerminal]);

  useEffect(() => {
    void spawnTerminal();

    return () => {
      lifecycleTokenRef.current += 1;
      clearRestartTimer();
      teardownTerminal(true);
    };
  }, [clearRestartTimer, spawnTerminal, teardownTerminal]);

  useEffect(() => {
    if (collapsed) return;

    const container = containerRef.current;
    const term = termRef.current;
    const fit = fitRef.current;
    const id = terminalIdRef.current;

    if (!container || !term || !fit || id === null) return;

    container.innerHTML = "";

    if (!term.element) {
      term.open(container);
      if (!webglLoadedRef.current) {
        try {
          term.loadAddon(new WebglAddon());
          webglLoadedRef.current = true;
        } catch {
          // Canvas fallback is fine.
        }
      }
    } else {
      container.appendChild(term.element);
    }

    requestAnimationFrame(() => {
      const currentFit = fitRef.current;
      const currentTerm = termRef.current;
      const currentId = terminalIdRef.current;
      if (!currentFit || !currentTerm || currentId === null) return;
      currentFit.fit();
      void window.electron.terminal.resize(currentId, currentTerm.cols, currentTerm.rows);
    });
  }, [collapsed, terminalId]);

  useEffect(() => {
    if (collapsed) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const fit = fitRef.current;
      const term = termRef.current;
      const id = terminalIdRef.current;
      if (!fit || !term || id === null) return;
      fit.fit();
      void window.electron.terminal.resize(id, term.cols, term.rows);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [collapsed, terminalId]);

  const restartTerminal = useCallback(async () => {
    autoRestartAttemptsRef.current = 0;
    clearRestartTimer();
    teardownTerminal(true);
    await spawnTerminal();
  }, [clearRestartTimer, spawnTerminal, teardownTerminal]);

  const clearTerminal = useCallback(() => {
    termRef.current?.clear();
  }, []);

  return (
    <div className={`terminal-panel${collapsed ? " collapsed" : ""}`}>
      <div className="terminal-header">
        <button className="terminal-collapse-toggle" onClick={onToggleCollapse}>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <TerminalSquare size={14} />
          <span>Terminal</span>
          {!collapsed && terminalId !== null && <span className="terminal-count">1</span>}
        </button>

        {!collapsed && (
          <div className="terminal-actions">
            <button className="terminal-action" onClick={clearTerminal} disabled={terminalId === null} aria-label="Clear terminal">
              <Eraser size={12} />
              Clear
            </button>
            <button className="terminal-action" onClick={() => void restartTerminal()} aria-label="Restart terminal">
              <RotateCcw size={12} />
              Restart
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="terminal-container" ref={containerRef}>
          {terminalId === null && (
            <div className="terminal-placeholder">{starting ? "Starting terminal..." : "Terminal stopped. Click Restart."}</div>
          )}
        </div>
      )}
    </div>
  );
}
