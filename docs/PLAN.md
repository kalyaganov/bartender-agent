# PLAN — реализация SPEC «Бармен»

> Пошаговый план реализации [SPEC.md](./SPEC.md). Разбит на те же 5 этапов (M0–M5) плюс нулевой (setup). Каждая задача имеет ID, привязку к разделу спецификации, список затрагиваемых файлов и критерий готовности (acceptance).
>
> Обозначения усилия: **S** ≤ 30 мин, **M** ~1–2 ч, **L** ~полдня. Параллелизуемые задачи отмечены `( паралл )` — их можно делать независимо от предыдущей в том же этапе.
>
> Как пользоваться: идём сверху вниз, чекаем пункты. В конце каждого этапа — «выхлоп» (что должно работать) и команды проверки.

---

## M-setup — подготовка проекта

- [ ] **S0.1** Инициализировать проект. `npm init`, `tsconfig.json` (target ES2022, jsx react-jsx, module ESNext, strict), `.gitignore` (`node_modules`, `.env`, `dist`), `README.md` (заглушка со ссылкой на SPEC). · *усилие S*
- [ ] **S0.2** Поставить зависимости из [SPEC §6](./SPEC.md#6-стек-и-зависимости): `react ink ink-text-input ink-spinner chalk zod zustand`, дев-зависимости `typescript tsx vitest @types/react`. · *усилие S*
- [ ] **S0.3** Создать скрипты в `package.json`: `dev` (`tsx watch src/index.tsx`), `start`, `typecheck` (`tsc --noEmit`), `test` (`vitest`). · *усилие S*
- [ ] **S0.4** Скелет каталогов из [SPEC §7](./SPEC.md#7-структура-проекта): пустые файлы/директории `src/{agent,state,ui,data,tests}` + `config.ts`, `App.tsx`, `index.tsx`. · *усилие S*
- [ ] **S0.5** Конфиг: `src/config.ts` — модель, провайдер, пороги (`REFUSE_THRESHOLD=7`, `METABOLISM_RATE`, `MAX_TOOL_ROUNDS`), импорт из `.env` (`dotenv` или `node --env-file`). `.env.example` с `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`. · *усилие S*

**Выхлоп этапа:** `npm run dev` запускается без ошибок; `npm run typecheck` зелёный.

---

## M0 — каркас Ink + статичное лицо + ввод

> SPEC §5.1, §7. Цель: терминальное окно рисуется, лицо neutral на месте, ввод работает.

- [ ] **M0.1** `src/index.tsx`: `render(<App/>)` через Ink. · *усилие S*
- [ ] **M0.2** `src/ui/Face.tsx`: компонент, принимающий `mood`, рендерящий лицо из таблицы `faces.ts`. Начать с одного `neutral`. · *усилие M* · SPEC §5.2
- [ ] **M0.3** `src/ui/faces.ts`: шаблон рамки + таблица черт хотя бы для `neutral` (остальные муды — в M2.2). · *усилие M* · SPEC §5.2
- [ ] **M0.4** `src/ui/InputBox.tsx`: текстовый ввод на `ink-text-input`, колбэк `onSubmit(text)`, очистка после отправки. · *усилие S*
- [ ] **M0.5** `src/ui/DialoguePanel.tsx`: отображение массива строк реплик (пока заглушки). · *усилие S*
- [ ] **M0.6** `src/ui/StatusBar.tsx`, `src/ui/Meter.tsx`, `src/ui/CocktailAnimation.tsx`, `src/ui/Tab.tsx`: статичные заглушки-плейсхолдеры (вернёмся в M3/M4). · *усилие S* `( паралл )`
- [ ] **M0.7** `src/App.tsx`: скомпоновать раскладку из [SPEC §5.1](./SPEC.md#51-раскладка-экрана-ink). Лицо по центру, внизу InputBox, эхо введённой строки в DialoguePanel. · *усилие M*
- [ ] **M0.8** Лёгкая анимация моргания в `<Face>` на `useState`+`setInterval` (глаза → `–` на 120 мс раз в ~3.5 c). · *усилие S* · SPEC §5.2

**Выхлоп M0:** окно как в §5.1, лицо neutral моргает, набранный текст появляется в DialoguePanel.
**Проверка:** `npm run dev` → лицо видно, ввод принимается, `npm run typecheck` зелёный.

---

## M1 — LLM loop, образ бармена, стрим реплик

> SPEC §2 (персонаж), §4.1 (prompt), §4.4 (провайдер). Цель: бармен отвечает в образе, реплики текут посимвольно.

- [ ] **M1.1** `src/agent/providers/types.ts`: интерфейс `LLMProvider` с `streamTurn(opts): AsyncIterable<StreamEvent>` (`StreamEvent = {type:'token'|'toolCall'|'done', ...}`). · *усилие M* · SPEC §4.4
- [ ] **M1.2** `src/agent/providers/anthropic.ts`: реализация через `@anthropic-ai/sdk` со стримингом. Пока без tool calling (только токены). · *усилие M* `( паралл )`
- [ ] **M1.3** `src/agent/providers/openai.ts`: альтернативная реализация через `openai`. · *усилие M* `( паралл )`
- [ ] **M1.4** `src/agent/prompt.ts`: system prompt из [SPEC §4.1](./SPEC.md#41-system-prompt-скелет) + профиль персонажа (§2.1, §2.2) + 2-3 few-shot примера голоса. · *усилие M*
- [ ] **M1.5** `src/state/store.ts`: zustand-стор сессии (поля из [SPEC §3.4](./SPEC.md#34-остальное-состояние-сессии)): `history`, `mood='neutral'`, `phase`, экшены `appendUserMessage`, `appendStreamingToken`, `finalizeAssistantTurn`. · *усилие M*
- [ ] **M1.6** `src/agent/loop.ts`: функция `runTurn(userText)` — append user msg → `provider.streamTurn` → токены в стор. Пока **без** разбора tool_call. · *усилие M* · SPEC §4.3 шаги 1–3
- [ ] **M1.7** Связать `App.tsx`: `InputBox.onSubmit` → `runTurn`. DialoguePanel показывает стрим текущей реплики. · *усилие S*
- [ ] **M1.8** Обработка ошибок провайдера: retry с backoff + fallback-реплика «*Виктор отвлёкся на бокал…*». · *усилие S* · SPEC §9

**Выхлоп M1:** вводишь реплику → бармен отвечает в характере, текст печатается живьём.
**Проверка:** вручную прогнать 3-4 ввода; `npm run typecheck`.

---

## M2 — tool calling, переключение mood, таблица лиц

> SPEC §4.2, §5.2, §3.3. Цель: лицо меняется по настроению, действие хода определяется моделью.

- [ ] **M2.1** `src/agent/schemas.ts`: zod-схемы `MoodEnum`, `BartenderAction`, `Drink`, `DrunkennessAssessment` из [SPEC §4.2](./SPEC.md#42-структурированный-вывод-через-tool-calling). · *усилие M*
- [ ] **M2.2** `src/ui/faces.ts`: дописать все 10 мудов из таблицы черт (§5.2) и собрать полный пиксель-арт каждого. · *усилие L* · SPEC §5.2
- [ ] **M2.3** `src/agent/tools.ts`: определение инструмента `bartender_action` (схема для провайдера) + диспетчер, парсящий `toolCall` в типизированный объект. · *усилие M*
- [ ] **M2.4** Расширить провайдеры (`anthropic.ts`, `openai.ts`) поддержкой передачи `tools` и эмиссии `toolCall`-событий в стриме. · *усилие M* · SPEC §4.2, §4.4
- [ ] **M2.5** `src/state/reducer.ts`: чистая функция `applyAction(state, action) -> state` — обновляет `mood`, `phase`, `menuOffered`. Пока без drunkenness/drink side-effects (заглушки). · *усилие M* · SPEC §3.4
- [ ] **M2.6** В `loop.ts` (M1.6): после стрима вызывать `parseToolCall` → `reducer.applyAction`. `<Face>` подписан на `state.mood` и переключает арт. · *усилие M* · SPEC §4.3 шаг 4a–b
- [ ] **M2.7** Юнит-тесты `tests/reducer.test.ts`: переходы mood/phase для каждого `action`. · *усилие S* · SPEC §11

**Выхлоп M2:** в зависимости от реплики игрока лицо бармена переключается между 10 выражениями; action определяется моделью.
**Проверка:** `npm test` зелёный; вручную проверить смену лица на разных вводах.

---

## M3 — модель опьянения, метр, пороги поведения

> SPEC §3.1–§3.2, §9. Цель: бармен реагирует на степень опьянения и на пороге отказывает.

- [ ] **M3.1** `src/state/drunkenness.ts`: функция `displayDrunkenness(perceivedScore, bacProxy)` = `clamp(0.6*p + 0.4*b, 0, 10)`, плюс `metabolize(bacProxy, minutes)`. Константы из `config.ts`. · *усилие M* · SPEC §3.1
- [ ] **M3.2** Юнит-тесты `tests/drunkenness.test.ts`: края (0, 10), взвешивание, метаболизм не уходит в минус. · *усилие S*
- [ ] **M3.3** Расширить `store.ts`: поля `drunkenness {perceivedScore, bacProxy, lastDrinkAt}`, экшен `applyDrunkennessAssessment(score)` обновляет `perceivedScore`. · *усилие S* · SPEC §3.4
- [ ] **M3.4** В `reducer.applyAction`: из `bartender_action.drunkennessAssessment` звать `applyDrunkennessAssessment`. Фоновый таймер метаболизма в `App.tsx` (`setInterval` раз в минуту → пересчёт `bacProxy`). · *усилие M* · SPEC §3.1, §4.3 шаг 4e
- [ ] **M3.5** Логика отказа в редюсере: если `displayDrunkenness ≥ REFUSE_THRESHOLD` и `action='pour_drink'` с `drink.alcoholic=true` → **форсировать** `refuse`/`suggest_home`, игнорируя модель. · *усилие M* · SPEC §3.2, §9
- [ ] **M3.6** `src/ui/Meter.tsx`: полоса `▰▰▰▱▱▱…` с подписью зоны (трезв/навеселе/пьян/…) из таблицы порогов §3.2. Подписка на `state.drunkenness`. · *усилие S* · SPEC §3.2, §5.1
- [ ] **M3.7** Тесты редюсера на пороги: отказ выше 7, корректные зоны. · *усилие S*
- [ ] **M3.8** System prompt (§2.2/§4.1): усилить инструкции по оценке опьянения (cues) и поведению в зонах. · *усилие S*

**Выхлоп M3:** метр двигается по ходу разговора; выше порога бармен перестаёт наливать и предлагает такси.
**Проверка:** `npm test`; ручной сценарий «спаивания» до отказа.

---

## M4 — коктейли, анимация, таб

> SPEC §3.4 (`tab`, `served`), §5.1. Цель: подаваемые напитки визуально готовятся, растёт счёт.

- [ ] **M4.1** `src/data/cocktails.ts`: мини-БД из 8–12 коктейлей: `{name, alcoholic, ingredients[], steps[], units, price}`. Включить б/а варианты (вода, лимонад) для `serve_water`. · *усилие M* · SPEC §7
- [ ] **M4.2** В `reducer.applyAction` для `pour_drink`/`serve_water`: пуш в `served` и `tab`, `bacProxy += drink.units`, `lastDrinkAt=now`. Если drink не из БД — валидация через zod, fallback на типовой units. · *усилие M* · SPEC §3.4, §4.3 шаг 4c
- [ ] **M4.3** `src/ui/CocktailAnimation.tsx`: поэтапная анимация смешивания (спиннер `ink-spinner` + прогресс `▒▒▓▓██`), триггерится на `pour_drink`. · *усилие M* · SPEC §5.1
- [ ] **M4.4** `src/ui/Tab.tsx`: текущая сумма счёта + последние 2 строки. Подписка на `state.tab`. · *усилие S*
- [ ] **M4.5** Команда `/menu`: вывод `data/cocktails` в DialoguePanel. · *усилие S* · SPEC §10
- [ ] **M4.6** Тесты редюсера: `pour_drink` увеличивает `bacProxy` и `tab`; б/а не увеличивает bacProxy. · *усилие S*

**Выхлоп M4:** заказ коктейля → анимация, реплика с рецептом, растут счёт и опьянение.
**Проверка:** `npm test`; ручной заказ нескольких коктейлей.

---

## M5 — финал, безопасность, полировка

> SPEC §3.2 (зона 9–10), §9, §10, §11. Цель: полный цикл «вход → доезжай домой».

- [ ] **M5.1** В редюсере: `action='call_taxi'` → `phase='leaving'`; подтверждение игрока → `phase='closed'`. Прощальная реплика из модели. · *усилие M* · SPEC §3.2, §4.3 шаг 6
- [ ] **M5.2** Команды `/leave`, `/exit`, `/help`, `/state` из [SPEC §10](./SPEC.md#10-команды-и-пользовательский-ввод). `/leave` — сценка прощания, `/exit` — жёсткий выход. · *усилие S*
- [ ] **M5.3** `Ctrl+C` обработка: одна прощальная реплика + корректный unmount Ink. · *усилие S* · SPEC §9
- [ ] **M5.4** Дисклеймер: строка «Это игра-симуляция…» при старте и в `/help`. · *усилие S* · SPEC §9
- [ ] **M5.5** Глобальные ограничения: `MAX_TOOL_ROUNDS` на ход, лимит реплик за сессию, таймаут провайдера. · *усилие S* · SPEC §9
- [ ] **M5.6** Аудит безопасности: ключи только из `.env`, нет логирования секретов, нет попадания ключей в `history`/prompt. · *усилие S* · SPEC §9
- [ ] **M5.7** Системный prompt: явные правила против опасных советов (за руль, смесь с лекарствами) — отговаривать напрямую. · *усилие S* · SPEC §9
- [ ] **M5.8** Сквозной E2E-прогон: чеклист сценариев (приветствие → заказ → шутка → спаивание → отказ → такси → прощание). Зафиксировать баги. · *усилие M*
- [ ] **M5.9** README: как запустить, переменные окружения, краткое описание. · *усилие S*

**Выхлоп M5:** полный игровой цикл; все команды; тесты и typecheck зелёные.
**Проверка:** `npm test && npm run typecheck && npm start`; прогон полного сценария.

---

## Сводка зависимостей между этапами

```
M-setup → M0 → M1 → M2 → M3 → M4 → M5
                  │           │
                  └─ M2.2 (лица) нужна M3.6 (метр ссылается на mood-зоны)
```

Параллелизуем внутри этапа: M0.6, M1.2/M1.3, M2.1/M2.2.

## Полировка «после v1» (из SPEC §12)

Не входит в план — backlog: несколько барменов, память завсегдатаев, NPC-посетители, атмосфера/время суток, save/load, голос, мини-игры.
