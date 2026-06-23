import { ProviderError } from "./errors";

export function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new ProviderError("Прервано", "abort", false));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ProviderError("Прервано", "abort", false));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}
