import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { KiloApi } from "./api";
import type { SSEPayload } from "./types";

// ── API singleton ───────────────────────────────────────────────
const SERVER_URL = "http://127.0.0.1:4100";

export function useApi() {
  return useMemo(() => new KiloApi(SERVER_URL), []);
}

export { SERVER_URL };

// ── localStorage hook ───────────────────────────────────────────
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch { /* quota exceeded or similar */ }
  }, [key, state]);

  return [state, setState];
}

// ── SSE real-time events ────────────────────────────────────────
type SSECallback = (payload: SSEPayload) => void;
type SSEStatus = "connecting" | "connected" | "disconnected";

export type SSEContextValue = {
  subscribe: (eventType: string, callback: SSECallback) => () => void;
  status: SSEStatus;
  reconnect: () => void;
};

export const SSEContext = createContext<SSEContextValue>({
  subscribe: () => () => {},
  status: "disconnected",
  reconnect: () => {},
});

export function useSSE(): SSEContextValue {
  return useContext(SSEContext);
}

export function useSSEConnection(serverUrl: string): SSEContextValue {
  const [status, setStatus] = useState<SSEStatus>("connecting");
  const [refreshKey, setRefreshKey] = useState(0);
  const callbacksRef = useRef<Map<string, Set<SSECallback>>>(new Map());

  useEffect(() => {
    let es: EventSource | null = null;
    let retryDelay = 1000;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      es = new EventSource(`${serverUrl}/global/event`);

      es.onopen = () => {
        if (cancelled) return;
        setStatus("connected");
        retryDelay = 1000;
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const payload: SSEPayload = data.payload ?? data;
          // Fire specific handlers
          const handlers = callbacksRef.current.get(payload.type);
          handlers?.forEach((cb) => cb(payload));
          // Fire wildcard handlers
          const wildcards = callbacksRef.current.get("*");
          wildcards?.forEach((cb) => cb(payload));
        } catch { /* malformed event */ }
      };

      es.onerror = () => {
        if (cancelled) return;
        setStatus("disconnected");
        es?.close();
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [serverUrl, refreshKey]);

  const subscribe = useCallback((eventType: string, callback: SSECallback) => {
    if (!callbacksRef.current.has(eventType)) {
      callbacksRef.current.set(eventType, new Set());
    }
    callbacksRef.current.get(eventType)!.add(callback);
    return () => {
      callbacksRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  const reconnect = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return { subscribe, status, reconnect };
}
