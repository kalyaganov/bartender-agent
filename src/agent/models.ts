import { toProviderError } from "./providers/errors";

export interface ProviderConnectionConfig {
  endpoint: string;
  token: string;
  extraHeaders?: Record<string, string>;
}

export type ModelsResult =
  | { kind: "available"; models: string[] }
  | { kind: "unsupported" };

function modelsUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/models`;
}

function httpError(response: Response): { status: number; headers: Headers; message: string } {
  return {
    status: response.status,
    headers: response.headers,
    message: `HTTP ${response.status}`,
  };
}

export async function listModels(
  config: ProviderConnectionConfig,
  signal?: AbortSignal,
): Promise<ModelsResult> {
  const headers = new Headers(config.extraHeaders);
  headers.set("Authorization", `Bearer ${config.token}`);

  let response: Response;
  try {
    response = await fetch(modelsUrl(config.endpoint), { headers, signal });
  } catch (err) {
    throw toProviderError(err);
  }

  if (response.status === 404 || response.status === 405 || response.status === 501) {
    return { kind: "unsupported" };
  }
  if (!response.ok) throw toProviderError(httpError(response));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "unsupported" };
  }
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) {
    return { kind: "unsupported" };
  }

  const ids = (body as { data: unknown[] }).data
    .map((entry) => entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  const models = [...new Set(ids)].sort((left, right) => left.localeCompare(right));

  return { kind: "available", models };
}
