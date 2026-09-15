import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listModels } from "../agent/models";

const fetchMock = vi.fn();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("listModels", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("запрашивает /models с token и дополнительными заголовками", async () => {
    fetchMock.mockResolvedValue(response({ data: [{ id: "z" }, { id: " a " }, { id: "a" }] }));
    await expect(listModels({
      endpoint: "https://api.example.com/v1/",
      token: "secret",
      extraHeaders: { "X-Title": "Bartender", Authorization: "wrong" },
    })).resolves.toEqual({ kind: "available", models: ["a", "z"] });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/models", expect.objectContaining({
      signal: undefined,
    }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer secret");
    expect(headers.get("X-Title")).toBe("Bartender");
  });

  it.each([404, 405, 501])("считает HTTP %i отсутствием каталога", async (status) => {
    fetchMock.mockResolvedValue(response({}, status));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" })).resolves.toEqual({ kind: "unsupported" });
  });

  it("считает не-OpenAI тело неподдерживаемым каталогом", async () => {
    fetchMock.mockResolvedValue(response({ models: [] }));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" })).resolves.toEqual({ kind: "unsupported" });
  });

  it("сохраняет пустой валидный список", async () => {
    fetchMock.mockResolvedValue(response({ data: [] }));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" })).resolves.toEqual({ kind: "available", models: [] });
  });

  it("классифицирует ошибку аутентификации", async () => {
    fetchMock.mockResolvedValue(response({}, 401));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" })).rejects.toMatchObject({ kind: "auth" });
  });

  it("классифицирует rate limit и сетевую ошибку", async () => {
    fetchMock.mockResolvedValue(response({}, 429));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" })).rejects.toMatchObject({ kind: "rateLimit" });
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" })).rejects.toMatchObject({ kind: "network" });
  });

  it("пробрасывает abort как ProviderError", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    await expect(listModels({ endpoint: "https://x/v1", token: "t" }, controller.signal)).rejects.toMatchObject({ kind: "abort" });
  });
});
