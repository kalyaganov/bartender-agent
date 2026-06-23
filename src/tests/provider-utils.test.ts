import { describe, it, expect } from "vitest";
import { withSignal } from "../agent/providers/provider-utils";
import { ProviderError } from "../agent/providers/errors";

describe("withSignal", () => {
  it("без signal возвращает promise как есть", async () => {
    await expect(withSignal(Promise.resolve(5))).resolves.toBe(5);
  });

  it("успешный результат при живом signal", async () => {
    const c = new AbortController();
    await expect(withSignal(Promise.resolve("ok"), c.signal)).resolves.toBe("ok");
  });

  it("уже aborted → немедленный reject ProviderError(abort)", async () => {
    const c = new AbortController();
    c.abort();
    await expect(withSignal(Promise.resolve(1), c.signal)).rejects.toMatchObject({
      kind: "abort",
    });
  });

  it("abort во время ожидания → ProviderError(abort)", async () => {
    const c = new AbortController();
    let resolveLater!: (v: number) => void;
    const pending = new Promise<number>((r) => {
      resolveLater = r;
    });
    const wrapped = withSignal(pending, c.signal);
    c.abort();
    await expect(wrapped).rejects.toBeInstanceOf(ProviderError);
    resolveLater(1);
  });

  it("пробрасывает ошибку промиса как есть", async () => {
    const c = new AbortController();
    await expect(
      withSignal(Promise.reject(new Error("boom")), c.signal),
    ).rejects.toThrow("boom");
  });
});
