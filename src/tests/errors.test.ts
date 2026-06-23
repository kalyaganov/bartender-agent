import { describe, it, expect } from "vitest";
import {
  ProviderError,
  toProviderError,
  type ProviderErrorKind,
} from "../agent/providers/errors";

function httpErr(status: number, headers?: Record<string, string>): unknown {
  return Object.assign(new Error(`http ${status}`), { status, headers });
}

describe("toProviderError", () => {
  it("401 → auth, не ретраить", () => {
    const e = toProviderError(httpErr(401));
    expect(e.kind).toBe("auth");
    expect(e.retryable).toBe(false);
  });

  it("403 → auth, не ретраить", () => {
    const e = toProviderError(httpErr(403));
    expect(e.kind).toBe("auth");
    expect(e.retryable).toBe(false);
  });

  it("429 → rateLimit, ретраить, парсит retry-after (секунды)", () => {
    const e = toProviderError(httpErr(429, { "retry-after": "2" }));
    expect(e.kind).toBe("rateLimit");
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(2000);
  });

  it("429 без заголовка — retryAfterMs undefined", () => {
    const e = toProviderError(httpErr(429));
    expect(e.kind).toBe("rateLimit");
    expect(e.retryAfterMs).toBeUndefined();
  });

  it("429 retry-after (HTTP-date) → число мс", () => {
    const future = new Date(Date.now() + 3000).toUTCString();
    const e = toProviderError(httpErr(429, { "retry-after": future }));
    expect(e.kind).toBe("rateLimit");
    expect(typeof e.retryAfterMs).toBe("number");
    expect(e.retryAfterMs!).toBeGreaterThan(0);
  });

  it("500 → network, ретраить", () => {
    const e = toProviderError(httpErr(503));
    expect(e.kind).toBe("network");
    expect(e.retryable).toBe(true);
  });

  it("400 → badRequest, не ретраить", () => {
    const e = toProviderError(httpErr(400));
    expect(e.kind).toBe("badRequest");
    expect(e.retryable).toBe(false);
  });

  it("422 → badRequest, не ретраить", () => {
    const e = toProviderError(httpErr(422));
    expect(e.kind).toBe("badRequest");
    expect(e.retryable).toBe(false);
  });

  it("без status → network, ретраить", () => {
    const e = toProviderError(new Error("ECONNRESET"));
    expect(e.kind).toBe("network");
    expect(e.retryable).toBe(true);
  });

  it("AbortError → abort, не ретраить", () => {
    const e = toProviderError(Object.assign(new Error("aborted"), { name: "AbortError" }));
    expect(e.kind).toBe("abort");
    expect(e.retryable).toBe(false);
  });

  it("ProviderError передаётся как есть", () => {
    const original = new ProviderError("x", "auth", false);
    expect(toProviderError(original)).toBe(original);
  });

  it("покрывает все kind", () => {
    const seen = new Set<ProviderErrorKind>();
    const cases = [401, 403, 429, 500, 400];
    for (const s of cases) seen.add(toProviderError(httpErr(s)).kind);
    seen.add(toProviderError(new Error("net")).kind);
    seen.add(toProviderError(Object.assign(new Error("a"), { name: "AbortError" })).kind);
    for (const k of ["auth", "rateLimit", "network", "badRequest", "abort"] as ProviderErrorKind[]) {
      expect(seen.has(k)).toBe(true);
    }
  });
});
