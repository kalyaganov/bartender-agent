import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { config } from "../config";
import { checkConnection, type ConnectionCheckResult } from "../agent/connection";
import { listModels, type ModelsResult } from "../agent/models";
import { hasProviderConnection, type Preferences } from "../persistence";
import { useAppStore } from "../state/app";
import { providerErrorMessage } from "./providerErrorMessage";

type Field = "refresh" | "filter" | "list" | "manual" | "thinking" | "test" | "save";
type LoadState = "idle" | "loading" | ModelsResult["kind"];
type CheckState = "idle" | "checking" | ConnectionCheckResult;

function visibleModels(models: string[], selected: number): { models: string[]; start: number } {
  const size = 8;
  const start = Math.max(0, Math.min(selected - Math.floor(size / 2), models.length - size));
  return { models: models.slice(start, start + size), start };
}

export function ModelSelectionScreen() {
  const back = useAppStore((s) => s.back);
  const go = useAppStore((s) => s.go);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const prefs = useAppStore((s) => s.prefs);
  const [model, setModel] = useState(prefs.model ?? "");
  const [thinking, setThinking] = useState(prefs.thinking ?? false);
  const [filter, setFilter] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [selected, setSelected] = useState(0);
  const [idx, setIdx] = useState(0);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const filtered = useMemo(
    () => models.filter((id) => id.toLowerCase().includes(filter.trim().toLowerCase())),
    [filter, models],
  );
  const hasList = loadState === "available" && models.length > 0;
  const fields: Field[] = hasList
    ? ["refresh", "filter", "list", "manual", "thinking", "test", "save"]
    : ["refresh", "manual", "thinking", "test", "save"];
  const active = fields[idx];
  const blocked = saving || loadState === "loading" || checkState === "checking";
  const visible = visibleModels(filtered, selected);

  function move(delta: number): void {
    setIdx((value) => (value + delta + fields.length) % fields.length);
  }

  function clearCheckState(): void {
    if (checkState !== "checking") setCheckState("idle");
  }

  function modelConfig(): { model: string; thinking: boolean } | null {
    const trimmedModel = model.trim();
    if (!trimmedModel) {
      setError("Выбери модель из списка или введи её точный ID вручную.");
      return null;
    }
    return { model: trimmedModel, thinking };
  }

  async function refresh(): Promise<void> {
    if (blocked || !hasProviderConnection(prefs)) return;
    setError(null);
    setLoadState("loading");
    const controller = new AbortController();
    let timedOut = false;
    controllerRef.current = controller;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.loop.providerTimeoutMs);
    try {
      const result = await listModels({
        endpoint: prefs.endpoint!,
        token: prefs.token!,
        extraHeaders: prefs.extraHeaders,
      }, controller.signal);
      if (result.kind === "available") {
        setModels(result.models);
        setFilter("");
        setSelected(0);
        setIdx(0);
      } else {
        setModels([]);
      }
      setLoadState(result.kind);
    } catch (err) {
      if (timedOut) setError("Истекло время ожидания ответа провайдера.");
      else if (!controller.signal.aborted) setError(providerErrorMessage(err));
      setModels([]);
      setLoadState("idle");
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  async function testConnection(): Promise<void> {
    if (blocked || !hasProviderConnection(prefs)) return;
    const next = modelConfig();
    if (!next) return;
    setError(null);
    setCheckState("checking");
    try {
      setCheckState(await checkConnection({
        endpoint: prefs.endpoint!,
        token: prefs.token!,
        model: next.model,
        thinking: next.thinking,
        extraHeaders: prefs.extraHeaders,
      }));
    } catch (err) {
      setCheckState("idle");
      setError(providerErrorMessage(err));
    }
  }

  async function save(): Promise<void> {
    if (blocked || !hasProviderConnection(prefs)) return;
    const next = modelConfig();
    if (!next) return;
    setError(null);
    setSaving(true);
    const nextPrefs: Preferences = { ...prefs, ...next };
    try {
      await setPrefs(nextPrefs);
      go("bar");
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
    if (active === "list") {
      if (key.return && filtered.length > 0) {
        setModel(filtered[selected]);
        clearCheckState();
        move(1);
      } else if (key.upArrow && filtered.length > 0) {
        setSelected((value) => (value - 1 + filtered.length) % filtered.length);
      } else if ((key.downArrow || key.tab) && filtered.length > 0) {
        setSelected((value) => (value + 1) % filtered.length);
      } else if (filtered.length === 0 && (key.return || key.downArrow || key.tab)) {
        move(1);
      }
      return;
    }
    if (active === "thinking") {
      if (key.return || input === " ") {
        setThinking((value) => !value);
        clearCheckState();
      } else if (key.upArrow) {
        move(-1);
      } else if (key.downArrow || key.tab) {
        move(1);
      }
      return;
    }
    if (active === "refresh" || active === "test" || active === "save") {
      if (key.return || input === " ") {
        if (active === "refresh") void refresh();
        else if (active === "test") void testConnection();
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

  if (!hasProviderConnection(prefs)) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="red">Сначала сохрани endpoint и token провайдера.</Text>
        <Text color="gray" dimColor>ESC — назад</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>Выбор модели</Text>
      <Text color="gray" dimColor>Endpoint: {prefs.endpoint}</Text>
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text color={active === "refresh" ? "cyan" : "gray"}>{active === "refresh" ? "▸" : " "}</Text>
          <Text color={active === "refresh" ? "cyan" : "white"} bold={active === "refresh"}>
            [{loadState === "loading" ? "Загружаю…" : "Обновить список моделей"}]
          </Text>
        </Box>
        {loadState === "unsupported" ? (
          <Text color="yellow">Провайдер не публикует совместимый список. Введи ID модели вручную.</Text>
        ) : null}
        {loadState === "available" && models.length === 0 ? (
          <Text color="yellow">Провайдер вернул пустой список. Введи ID модели вручную.</Text>
        ) : null}
        {hasList ? (
          <>
            <Box gap={1}>
              <Text color={active === "filter" ? "cyan" : "gray"}>{active === "filter" ? "▸" : " "}</Text>
              <Text color="green">{"Фильтр".padEnd(10)}</Text>
              {active === "filter" ? (
                <TextInput value={filter} onChange={(value) => {
                  setFilter(value);
                  setSelected(0);
                }} focus={!blocked} placeholder="часть ID" />
              ) : <Text>{filter || "(все)"}</Text>}
            </Box>
            <Box flexDirection="column">
              <Text color="gray">Модели {filtered.length ? `${visible.start + 1}–${visible.start + visible.models.length} из ${filtered.length}` : ""}</Text>
              {visible.models.map((id, index) => {
                const modelIndex = visible.start + index;
                return (
                  <Box key={id} gap={1}>
                    <Text color={active === "list" && modelIndex === selected ? "cyan" : "gray"}>
                      {active === "list" && modelIndex === selected ? "▸" : " "}
                    </Text>
                    <Text color={active === "list" && modelIndex === selected ? "cyan" : "white"} bold={active === "list" && modelIndex === selected}>{id}</Text>
                  </Box>
                );
              })}
              {filtered.length === 0 ? <Text color="gray">Ничего не найдено — введи ID вручную.</Text> : null}
            </Box>
          </>
        ) : null}
        <Box gap={1}>
          <Text color={active === "manual" ? "cyan" : "gray"}>{active === "manual" ? "▸" : " "}</Text>
          <Text color="green">{"Модель".padEnd(10)}</Text>
          {active === "manual" ? (
            <TextInput value={model} onChange={(value) => {
              setModel(value);
              clearCheckState();
            }} focus={!blocked} placeholder="Точный ID модели" />
          ) : <Text>{model || "(не выбрана)"}</Text>}
        </Box>
        <Text color="gray" dimColor>Можно выбрать из списка или ввести точный ID от провайдера.</Text>
        <Box gap={1}>
          <Text color={active === "thinking" ? "cyan" : "gray"}>{active === "thinking" ? "▸" : " "}</Text>
          <Text color="green">{"Thinking".padEnd(10)}</Text>
          <Text color={active === "thinking" ? "cyan" : "white"}>[{thinking ? "✓" : " "}] {thinking ? "ON" : "OFF"}</Text>
        </Box>
        <Text color="gray" dimColor>Включай, только если провайдер документирует reasoning.</Text>
        <Box gap={1}>
          <Text color={active === "test" ? "cyan" : "gray"}>{active === "test" ? "▸" : " "}</Text>
          <Text color={active === "test" ? "cyan" : "white"} bold={active === "test"}>[{checkState === "checking" ? "Проверяю…" : "Проверить выбранную модель"}]</Text>
        </Box>
        {checkState === "ready" ? <Text color="green">Подключение работает: Chat Completions, streaming и инструменты доступны.</Text> : null}
        {checkState === "tools-unavailable" ? <Text color="yellow">Модель отвечает, но не вызвала инструмент. Для Виктора нужна поддержка tool calling.</Text> : null}
        <Box gap={1}>
          <Text color={active === "save" ? "cyan" : "gray"}>{active === "save" ? "▸" : " "}</Text>
          <Text color={active === "save" ? "cyan" : "white"} bold={active === "save"}>[{saving ? "Сохранение…" : "Сохранить модель"}]</Text>
        </Box>
      </Box>
      {error ? <Text color="red">{error}</Text> : null}
      <Text color="gray" dimColor>↑/↓ или Tab — поле · Enter — выбрать/запустить · ESC — назад</Text>
    </Box>
  );
}
