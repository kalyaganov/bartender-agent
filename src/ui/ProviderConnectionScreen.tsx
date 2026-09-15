import { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { config } from "../config";
import { listModels, type ModelsResult } from "../agent/models";
import { type Preferences } from "../persistence";
import { useAppStore } from "../state/app";
import { providerErrorMessage } from "./providerErrorMessage";

type Field = "endpoint" | "token" | "load" | "save";
type LoadState = "idle" | "loading" | ModelsResult["kind"];

const FIELDS: Field[] = ["endpoint", "token", "load", "save"];

export function ProviderConnectionScreen() {
  const back = useAppStore((s) => s.back);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const initial = useAppStore((s) => s.prefs);
  const [endpoint, setEndpoint] = useState(initial.endpoint ?? "");
  const [token, setToken] = useState(initial.token ?? "");
  const [idx, setIdx] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [modelsCount, setModelsCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const active = FIELDS[idx];
  const blocked = saving || loadState === "loading";

  function move(delta: number): void {
    setIdx((value) => (value + delta + FIELDS.length) % FIELDS.length);
  }

  function connection(): { endpoint: string; token: string } | null {
    const nextEndpoint = endpoint.trim();
    const nextToken = token.trim();
    if (!nextEndpoint || !nextToken) {
      setError("Заполни endpoint и token.");
      return null;
    }
    return { endpoint: nextEndpoint, token: nextToken };
  }

  function clearLoad(): void {
    if (loadState !== "loading") {
      setLoadState("idle");
      setModelsCount(null);
    }
  }

  async function loadModels(): Promise<void> {
    if (blocked) return;
    const next = connection();
    if (!next) return;
    setError(null);
    setNotice(null);
    setModelsCount(null);
    setLoadState("loading");
    const controller = new AbortController();
    let timedOut = false;
    controllerRef.current = controller;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.loop.providerTimeoutMs);
    try {
      const result = await listModels({ ...next, extraHeaders: initial.extraHeaders }, controller.signal);
      if (result.kind === "available") {
        setModelsCount(result.models.length);
      }
      setLoadState(result.kind);
    } catch (err) {
      if (timedOut) setError("Истекло время ожидания ответа провайдера.");
      else if (!controller.signal.aborted) setError(providerErrorMessage(err));
      setLoadState("idle");
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  async function save(): Promise<void> {
    if (blocked) return;
    const next = connection();
    if (!next) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    const changed = next.endpoint !== initial.endpoint || next.token !== initial.token;
    const prefs: Preferences = { ...initial, ...next };
    if (changed) {
      delete prefs.model;
      prefs.thinking = false;
    }
    try {
      await setPrefs(prefs);
      setNotice(changed
        ? "Подключение сохранено. Теперь выбери модель."
        : "Подключение сохранено.");
    } catch {
      setError("Не удалось сохранить настройки. Проверь права на каталог и свободное место.");
    } finally {
      setSaving(false);
    }
  }

  useInput((input, key) => {
    if (key.escape) {
      controllerRef.current?.abort();
      back();
      return;
    }
    if (blocked) return;
    if (active === "load" || active === "save") {
      if (key.return || input === " ") {
        if (active === "load") void loadModels();
        else void save();
      } else if (key.upArrow) {
        move(-1);
      } else if (key.downArrow || key.tab) {
        move(1);
      }
      return;
    }
    if (key.upArrow) move(-1);
    else if (key.downArrow || key.tab || key.return) move(1);
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>Подключение к провайдеру</Text>
      <Text color="gray" dimColor>Нужен OpenAI-compatible API. Endpoint обычно оканчивается на /v1.</Text>
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text color={active === "endpoint" ? "cyan" : "gray"}>{active === "endpoint" ? "▸" : " "}</Text>
          <Text color="green">{"Endpoint".padEnd(10)}</Text>
          {active === "endpoint" ? (
            <TextInput
              value={endpoint}
              onChange={(value) => {
                setEndpoint(value);
                clearLoad();
              }}
              focus={!blocked}
              placeholder="https://api.provider.com/v1"
            />
          ) : <Text>{endpoint || "(пусто)"}</Text>}
        </Box>
        <Text color="gray" dimColor>Не добавляй /chat/completions.</Text>
        <Box gap={1}>
          <Text color={active === "token" ? "cyan" : "gray"}>{active === "token" ? "▸" : " "}</Text>
          <Text color="green">{"Token".padEnd(10)}</Text>
          {active === "token" ? (
            <TextInput
              value={token}
              onChange={(value) => {
                setToken(value);
                clearLoad();
              }}
              focus={!blocked}
              mask="•"
              placeholder="sk-…"
            />
          ) : <Text>{token ? "•".repeat(Math.min(token.length, 16)) : "(пусто)"}</Text>}
        </Box>
        <Box marginTop={1} gap={1}>
          <Text color={active === "load" ? "cyan" : "gray"}>{active === "load" ? "▸" : " "}</Text>
          <Text color={active === "load" ? "cyan" : "white"} bold={active === "load"}>
            [{loadState === "loading" ? "Загружаю…" : "Загрузить список моделей"}]
          </Text>
        </Box>
        {loadState === "available" ? (
          <Text color="green">Провайдер отдал моделей: {modelsCount ?? 0}. Выбери нужную в следующем блоке.</Text>
        ) : null}
        {loadState === "unsupported" ? (
          <Text color="yellow">Провайдер не публикует совместимый список. ID модели можно ввести вручную.</Text>
        ) : null}
        <Box gap={1}>
          <Text color={active === "save" ? "cyan" : "gray"}>{active === "save" ? "▸" : " "}</Text>
          <Text color={active === "save" ? "cyan" : "white"} bold={active === "save"}>[{saving ? "Сохранение…" : "Сохранить подключение"}]</Text>
        </Box>
      </Box>
      {notice ? <Text color="green">{notice}</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Text color="gray" dimColor>↑/↓ или Tab — поле · Enter — далее/запустить · ESC — назад</Text>
    </Box>
  );
}
