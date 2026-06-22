# SPEC-publish · Публикация в npm

> Публичный npm-пакет `bartender-agent` с бинарником `bartender`. Установка `npm i -g bartender-agent` → запуск `bartender` из любого места, с конфигом в `~/.bartender-agent/.env`.
>
> Связано: [SPEC.md](./SPEC.md), [BACKLOG.md](./BACKLOG.md).

## Проблема

Сейчас пакет `"private": true` ([package.json:6](../package.json#L6)) и не собирается — `tsconfig.json` с `noEmit: true` ([tsconfig.json:17](../tsconfig.json#L17)), запуск через `tsx --env-file=.env src/index.tsx` ([package.json:8-9](../package.json#L8-L9)). Для публичной публикации три блокера:

1. **Нет сборки.** Сборки в JS не существует; tsx — только devDep. При `npm i -g` запускать нечего.
2. **Env сломается.** `--env-file=.env` подгружает переменные самим node/tsx при запуске из репо. После глобальной установки `.env` рядом нет — `config.ts` увидит пустое окружение, провайдер не подберётся, пользователь увидит пикер без единого настроенного провайдера ([src/config.ts:17](../src/config.ts#L17), [src/bootstrap.ts:43-57](../src/bootstrap.ts#L43-L57)).
3. **Нет metadata.** `private: true`, нет `bin`/`files`/`main`/`engines`/`license`/`author`/`repository` — npm отклонит или пакет будет непригоден к использованию.

## Дизайн

### Сборка: esbuild-bundle

Один самодостаточный ESM-бандл `dist/index.js` через esbuild (`--bundle --platform=node --format=esm`). Причины:
- Единый файл, никакого runtime-resolver-кошмара с `.js`-расширениями в относительных импортах (TS+ESM+`"type": "module"`).
- Быстрый старт, малый размер (нативные node_modules остаются external).
- tsx остаётся devDep (для `dev`/`start`).
- `dev`/`start` не трогаются — дев-опыт прежний.

**Внешние (external) зависимости** — всё из `dependencies` (`ink`, `react`, `openai`, `@anthropic-ai/sdk`, `zustand`, `zod`, `ink-text-input`) остаются external, резолвятся из `node_modules` установленного пакета.

### Env-loader: dotenv из пользовательского конфига

До парсинга `EnvSchema` читать `~/.bartender-agent/.env` через `dotenv`. Реальное `process.env` всегда побеждает (`override: false` — важно для CI/контейнеров с export-переменными). CWD `.env` для published-пакета не нужен: пользователь запускает `bartender` из случайной папки, а в дев-режиме `--env-file=.env` от tsx уже работает. Путь `~/.bartender-agent/` соответствует существующему паттерну персистентности ([src/persistence.ts:5](../src/persistence.ts#L5)).

```ts
import dotenv from "dotenv";
dotenv.config({ path: join(homedir(), ".bartender-agent", ".env") });
const parsed = EnvSchema.parse(process.env);
```

### bin / files / metadata

- `bin/bartender.js` — `#!/usr/bin/env node` + `import "../dist/index.js"`. `chmod +x`.
- `files: ["dist", "bin"]` — whitelist, `.env`/`.git`/`src`/`scripts`/`docs`/`tests` в tarball не попадают.
- `engines.node: ">=18"` (по README:63).
- `prepublishOnly`: `npm run typecheck && npm test && npm run build` — автоматическая защита от публикации сломанного.

## Затронутые файлы

| Файл | Изменение |
|---|---|
| `package.json` | Снять `private`, добавить `bin`/`files`/`main`/`engines`/`license`/`author`/`repository`/`keywords`/`type` (уже module)/`scripts.build`/`scripts.prepublishOnly`; `dotenv` в `dependencies`, `esbuild` в `devDependencies` |
| `tsconfig.json` | Без изменений (`noEmit: true` остаётся — typecheck отдельно; сборку делает esbuild) |
| `src/config.ts` | До `EnvSchema.parse(process.env)` грузить `~/.bartender-agent/.env` + CWD `.env` через dotenv |
| `bin/bartender.js` | Новый — шейбан + импорт бандла |
| `LICENSE` | Новый — MIT, Alexey Kalyaganov, 2026 |
| `README.md` | Секция «Установка» (npm i -g / ~ / bin), упомянуть `~/.bartender-agent/.env` |
| `.gitignore` | Без изменений (`dist/` уже игнорируется) |
| `docs/SPEC-publish.md` | Этот файл |

## Тесты

1. **typecheck** не падает (`npm run typecheck`).
2. **vitest** проходит (`npm test`).
3. **build** produces `dist/index.js` (`npm run build`).
4. **bin smoke**: `node bin/bartender.js` стартует и рендерит alt-screen (ручная проверка, т.к. интерактивный TUI).
5. **npm pack dry-run**: tarball содержит только `dist/`, `bin/`, `package.json`, `README.md`, `LICENSE` — без `.env`, `src/`, `scripts/`, `tests/`.
6. **env-loader**: юнит-тест, что `~/.bartender-agent/.env` с `OPENCODE_GO_API_KEY=test` попадает в `config.apiKeys["opencode-go"]` (мок `os.homedir` или использование `dotenv` напрямую).

## Усилие

M — сборка + env-loader + metadata + тесты. ~1.5–2 часа.

## Критерии готовности

- [x] SPEC-publish.md написан
- [x] `npm run build` → `dist/index.js` существует
- [x] `npm pack --dry-run` показывает чистый tarball
- [x] `npm run typecheck` зелёный
- [x] `npm test` зелёный
- [x] README обновлён секцией установки
- [x] Готов к `npm publish` (после `npm login` пользователя)
