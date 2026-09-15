import { toProviderError } from "../agent/providers/errors";

export function providerErrorMessage(error: unknown): string {
  switch (toProviderError(error).kind) {
    case "auth":
      return "Провайдер отклонил token. Проверь значение и повтори.";
    case "rateLimit":
      return "Провайдер ограничил частоту запросов. Попробуй позже.";
    case "badRequest":
      return "Провайдер отклонил запрос. Проверь endpoint и настройки.";
    case "network":
      return "Не удалось связаться с провайдером. Проверь endpoint и подключение.";
    case "abort":
      return "Проверка подключения отменена.";
    case "unknown":
      return "Провайдер вернул неизвестную ошибку. Проверь настройки.";
  }
}
