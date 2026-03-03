import { beforeEach, describe, expect, it, vi } from "vitest";
import { KiloApi } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("KiloApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends workspace headers for scoped requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const api = new KiloApi("http://127.0.0.1:4100");
    await api.listMessages("/tmp/project", "abc123");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/session/abc123/message",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-opencode-directory": "/tmp/project",
        }),
      }),
    );
  });

  it("throws clear errors for non-ok responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("nope", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = new KiloApi("http://127.0.0.1:4100");

    await expect(api.health()).rejects.toThrow("Request failed (500)");
  });

  it("throws when response is not valid json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = new KiloApi("http://127.0.0.1:4100");

    await expect(api.health()).rejects.toThrow("Invalid JSON response from /global/health");
  });

  it("sends prompt payload with text part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ info: {}, parts: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const api = new KiloApi("http://127.0.0.1:4100");
    await api.prompt("/tmp/project", "session-1", "Build this");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/session/session-1/message",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ parts: [{ type: "text", text: "Build this" }] }),
      }),
    );
  });
});
