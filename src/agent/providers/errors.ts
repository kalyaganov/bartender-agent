export type ProviderErrorKind =
  | "auth"
  | "rateLimit"
  | "network"
  | "badRequest"
  | "abort"
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    kind: ProviderErrorKind,
    retryable: boolean,
    retryAfterMs?: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryable = retryable;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

interface HttpErrorLike {
  status?: number;
  message?: string;
  headers?: Record<string, string> | Headers;
}

function isAbort(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  return (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === "AbortError"
  );
}

function readHeader(
  headers: Record<string, string> | Headers | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const rec = headers as Record<string, string>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  return key ? rec[key] : undefined;
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (isAbort(err)) {
    return new ProviderError("Прервано", "abort", false);
  }

  const http = err as HttpErrorLike;
  const status = typeof http?.status === "number" ? http.status : undefined;
  const message = err instanceof Error ? err.message : String(err);

  if (status === undefined) {
    return new ProviderError(message || "Сетевая ошибка", "network", true, undefined, err);
  }

  if (status === 401 || status === 403) {
    return new ProviderError(`Ошибка аутентификации (${status})`, "auth", false, undefined, err);
  }
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(readHeader(http.headers, "retry-after"));
    return new ProviderError("Превышен лимит запросов", "rateLimit", true, retryAfterMs, err);
  }
  if (status >= 500) {
    return new ProviderError(`Ошибка сервера (${status})`, "network", true, undefined, err);
  }
  if (status >= 400) {
    return new ProviderError(`Некорректный запрос (${status})`, "badRequest", false, undefined, err);
  }
  return new ProviderError(message || `Неизвестная ошибка (${status})`, "unknown", true, undefined, err);
}
