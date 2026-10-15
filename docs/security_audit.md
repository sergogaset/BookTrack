# Аудит безопасности BookTrack — ДЗ6

[Навигация](README.md) · [Интеграции](integration_documentation.md) · [SQL/Auth ДЗ5](backend_documentation.md)

Дата: 15.10.2026 (Europe/Moscow). Это ограниченный аудит доступного репозитория
и существующего Supabase двумя обычными тестовыми аккаунтами, не внешний pentest.
Внешние Dashboard-настройки без доступа не объявляются проверенными.

## 1. Цель аудита

Проверить изоляцию личных библиотек, обработку строк/ошибок/секретов,
зависимости, новые OAuth/аналитику/Health и автоматизацию deployment. Найденные
проблемы должны иметь подтверждение, исправление и повторную проверку.

## 2. Проверенные компоненты

- React AuthenticatedApp/App, формы и безопасный вывод BookCard.
- Supabase client/AuthService/CRUD adapter, типы, allowlist записываемых полей.
- Миграция books, ENABLE/FORCE RLS, policies/grants, CHECK/trigger.
- Новая read-only health RPC и Vercel handler, timeout и безопасные ответы.
- Google PKCE flow и очистка callback, согласие/цели Метрики, JSON logger.
- package.json/package-lock.json, Git ignore/доступная история, CI/CD/vercel.json.

Удалённо проверялись Auth/REST/CRUD/RLS существующего проекта. Не применялись
DDL, административные ключи или изменения настроек аккаунтов. Тест менял и
удалял только собственные новые fixture ID; существующие записи не затрагивались.

## 3. Инструменты аудита

`npm audit --json`, ESLint, TypeScript, Vitest/RTL с настоящим Supabase SDK и
перехваченными HTTP, локальный PostgreSQL/PGlite, реальные Supabase API-запросы
двумя тестовыми пользователями, Playwright/Edge, `rg`, Git и
`scripts/check-secrets.mjs`. Код дополнительно проанализирован Codex.

Риски сопоставлены с [OWASP Top 10:2025](https://top10.owasp.org/2025/0x00_2025-Introduction/).
Для ключей и RLS использованы [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
и [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
Это методика анализа, не сертификат соответствия OWASP.

## 4. Результаты npm audit

Первоначальный **реальный online audit**: **10** замечаний — 2 critical,
5 high, 3 moderate. Все относились к dev-цепочкам Vitest/Tailwind; production
зависимости не перечислялись. Critical здесь — оценка advisory/пакета,
не утверждение о доказанной удалённой эксплуатации production BookTrack.

| Цепочка | Подтверждённая проблема | Исправление | Повторный результат |
| --- | --- | --- | --- |
| Vitest → tinypool | Critical: prototype-pollution gadgets → RCE в worker options; [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | Vitest 4.1.11; уязвимый tinypool удалён из используемой цепочки | Не перечисляется в новом audit |
| Vitest / @vitest/mocker | Moderate: arbitrary file read/path traversal в redirect mocks; [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Vitest и mocker 4.1.11 | Не перечисляется |
| Tailwind → chokidar / micromatch / fast-glob → braces | High: stack exhaustion при глубоко вложенных patterns; [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Tailwind 4.3.3 и новый PostCSS plugin; старая цепочка удалена | Не перечисляется |
| Tailwind → postcss-nested / postcss-selector-parser | Moderate: квадратичный parsing/CPU exhaustion; [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Удалена старая цепочка при обновлении Tailwind | Не перечисляется |

Перечисление npm включало также зависимые пакеты; 10 записей не означают
10 независимых первопричин. `npm audit fix --force` не применялся.
Из-за несовместимых исправлений старого dev-стека выполнен контролируемый переход
Vitest 3 → 4, Tailwind 3 → 4 и Node 18 → поддерживаемый Node 22 LTS.
PostCSS config/CSS адаптированы минимально, затем проверены UI и сборка.

**Повторный online audit: 0 уязвимостей всех уровней**, exit 0.
Сохранён фактический [npm-audit.json](images/hw6/npm-audit.json).
CI использует `npm audit --audit-level=low`, не исключает dev dependencies
и не подавляет ошибки. [Поведение audit-level](https://docs.npmjs.com/cli/commands/npm-audit/).

## 5. Проверка OWASP Top 10

| Категория 2025 | Наблюдения по фактическому коду / тестам | Результат и предел |
| --- | --- | --- |
| A01 Broken Access Control | FORCE RLS, четыре owner policies, ограниченные INSERT/UPDATE columns; проверены A→B и B→A, anon, подмена владельца | Чужой CRUD запрещён локально и live; новую health RPC проверили локально |
| A02 Security Misconfiguration | HTTPS project URL, publishable-only validation, ignore env/CLI, main-only deploy, security headers | Ошибок доступа к данным не подтверждено; OAuth allowlist/hosting Dashboard требуют настройки |
| A03 Software Supply Chain Failures | Online npm audit и lockfile, npm ci, зафиксированный Vercel CLI | Реальные dev advisories исправлены, audit 0; supply chain risk полностью не исключён |
| A04 Cryptographic Failures | Auth/REST через HTTPS, пароли/токены ведёт Supabase SDK; собственная криптография отсутствует | Секреты в доступных source/docs/build не найдены; browser session storage остаётся целью при XSS |
| A05 Injection | React выводит title/author/notes как текст, нет dangerouslySetInnerHTML/eval; SDK строит REST filters, SQL-пользовательские строки не конкатенируются | XSS fixture отображается текстом, SQL injection sink не обнаружен |
| A06 Insecure Design | UI отделён от repository, серверная валидация, owner restrictions независимо от frontend, не повторяет неподтверждённую запись | Подтверждено тестами; SSRF-сценарий health ограничен серверной конфигурацией URL и запретом redirects |
| A07 Authentication Failures | getUser при restore, expiry/401 invalidation, локальный signOut, PKCE verifier/code обрабатывает SDK, redirect строится только из origin | SDK/UI сценарии пройдены; реальный Google consent/provider ещё не проверен |
| A08 Software or Data Integrity Failures | npm lock integrity, CI до deploy, allowlist полей, runtime проверка ответов/id/владельца | Повреждённая representation не объявляется успехом; внешний Actions run ещё отсутствует |
| A09 Security Logging and Alerting Failures | JSON словарь без raw cause/payload, serverless UUID, клиентские подробности выключены production | Logger проверен; Vercel/Supabase Logs и UptimeRobot alerts ожидают настройки |
| A10 Mishandling of Exceptional Conditions | Ошибки не стирают черновик, uncertain mutation блокирует retry, safe auth errors, health fail-closed 503 и timeout, analytics catch | Сценарии тестируются; публичный deployment с этими ответами ещё не создан |

CSRF: CRUD использует явный Bearer header SDK, автоматической cookie-сессии
на собственном backend нет. OAuth state/PKCE ведёт Supabase; самодельная обработка
не добавлена. Health — read-only GET. Это анализ применимых механизмов,
не утверждение, что все возможные CSRF-атаки исключены.

## 6. Анализ Supabase Auth и RLS

`books` привязана к `auth.users`; в четырёх политиках `auth.uid() = user_id`.
INSERT/UPDATE разрешают только title/author/status/rating/notes. Владелец
назначается БД, id/даты/owner защищены grants и trigger. RLS принудительная;
UI owner-filter — дополнительная проверка. Test роли не superuser/BYPASSRLS.

Live тест двумя **разными существующими подтверждёнными тестовыми аккаунтами**:
**33 проверки PASS** — [отчёт ДЗ6](images/hw6/live-api-results.json). Чужие
SELECT/UPDATE/DELETE возвращают ноль строк в обоих направлениях без frontend
owner-filter, подмена user_id и служебных полей запрещена, anon CRUD получает
42501, CHECK/NOT NULL действуют. Данные переживают восстановление сессии и
повторный вход; fixture удаляется только владельцем и отсутствие проверяется.

Проверены текущие email/password сессии. Google users будут теми же обычными
пользователями Auth; новые таблицы и привилегии для Google не добавлены.
Client Secret по инструкции хранится только в Supabase provider. Фактическое
его размещение и Google allowlist агент проверить не может.

Новая `booktrack_health()` использует SECURITY INVOKER, `search_path = ''`,
`SELECT true`, EXECUTE только anon/authenticated после REVOKE PUBLIC. Она не
читает книги, не возвращает структуру схемы/пользователей, не обходит RLS.
PGlite проверил её от anon и сохранение запрета SELECT books; удалённо миграция
не применялась агентом. Права удалённой RPC пока **ожидают ручной проверки**.

## 7. Найденные реальные уязвимости

| ID / описание | Риск | Файл / компонент | Выявление | Исправление | Статус / повторная проверка |
| --- | --- | --- | --- | --- | --- |
| SEC-01: tinypool prototype pollution gadgets | Critical по npm advisory; dev runner | package-lock, Vitest transitive dependency | npm audit online | Vitest 4.1.11 и обновлённый lock | Исправлено; audit 0, Vitest тесты проходят |
| SEC-02: mocker path traversal | Moderate; test tooling | Vitest / @vitest/mocker | npm audit online | Vitest/mocker 4.1.11 | Исправлено; audit 0, SDK/RTL тесты проходят |
| SEC-03: braces nested-pattern exhaustion | High; build/watch tooling | Tailwind dependency chain | npm audit online | Tailwind 4.3.3, @tailwindcss/postcss, новый CSS import | Исправлено; audit 0, build и browser regression проходят |
| SEC-04: selector parser CPU exhaustion | Moderate; build tooling | Tailwind → postcss-selector-parser | npm audit online | Удалена старая цепочка при переходе Tailwind | Исправлено; audit 0, production CSS собирается |

Подтверждённых XSS, SQL injection, утечки административных ключей или нарушения
RLS в приложении не найдено. Воспроизводимые security findings — зависимости
выше; новые проблемы ради заполнения таблицы не добавлены.

## 8. Исправления

Помимо устранения advisories, для новых интеграций добавлены защитные меры:
PKCE, фиксированный same-origin redirect, удаление callback code/error из URL;
согласие до загрузки аналитики, обезличенные фиксированные pages/goals без
query/hash/referrer и отключённая запись форм; fail-closed health, 4s timeout,
no-store, отсутствие admin key; JSON словарь, production suppression клиентских
warning; запрет Git-based дублирующего deploy. Эти меры — реализация требований,
а не обнаруженные ранее уязвимости.

ESLint обнаружил в существующем browser live script throw внутри finally;
cleanup вынесен в отдельную async-функцию, чтобы сохранить обработку ошибок.
Это исправление качества кода, не отдельная подтверждённая security vulnerability.

## 9. Повторная проверка

| Команда / проверка | Результат |
| --- | --- |
| `npm ci` | Успешно в изолированной `.tools/ci` с тем же package/lockfile на Node 22/npm 10; основная папка занята dev-процессом |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, без отключения обязательных правил для сокрытия ошибок |
| `npm test` | 84 теста, 11 файлов, PASS; Auth/PKCE/consent/goals/health/logger + прежняя регрессия |
| `npm run test:sql` | 37 assertions PASS, локальный PostgreSQL, A/B/anon |
| `npm run build` | PASS, 109 модулей; Vite 6.4.4 |
| Browser regression | PASS, Edge, 12 измерений без overflow на 320/768/1280, [JSON](images/hw6/browser-results.json) |
| Live Supabase test | PASS, 33 assertions двумя обычными аккаунтами, [JSON](images/hw6/live-api-results.json) |
| `npm audit --json` | Exit 0, все severity 0, [JSON](images/hw6/npm-audit.json) |
| `npm run check:secrets` | PASS; доступные приватные credentials не найдены в source/docs/build; env/CLI игнорируются |

Локальный npm ci в основном `node_modules` сначала встретил Windows EPERM:
esbuild/rollup заняты уже работающим dev server. Этот процесс не завершался
агентом. Зависимости восстановлены через install, чистая установка проверена в
игнорируемой изолированной папке. Старый npm 9/10 resolver при изменении графа
также давал edgesOut; lockfile обновлён npm 11, затем npm 10 успешно выполнил ci.
Эти фактические ограничения среды не объявляются дефектом production.

Secret scan проверяет известные шаблоны и доступные приватные значения без
вывода значений, tracked env paths, gitignore и наличие env-путей в доступной
локальной истории. Публичные Vite Supabase URL/key в production bundle ожидаемы.
Полное отсутствие всех возможных секретов и состояние удалённой GitHub history
не доказываются эвристическим сканером. Конфигурация и история аккаунтов не читались.

## 10. Остаточные риски

- Реальные Google OAuth, URLs/allowlist, production env, Actions secrets,
  Vercel routing/headers/runtime и alert email ещё не подтверждены в сервисах.
- Аудит отражает текущую базу npm advisories; отсутствие замечаний не гарантирует
  отсутствие неизвестных уязвимостей. Зависимости CLI и hosting — отдельная supply chain.
- ESLint 9.39.5 отмечен registry как больше не поддерживаемый; advisories не
  обнаружены. Обновлять linter в рамках планового сопровождения с повторным lint.
- XSS в будущем может дать доступ к browser Auth storage. Нельзя добавлять HTML
  заметок или произвольные scripts. CSP требует отдельного согласования с реальными
  доменами Метрики/Supabase; наличие CSP не заявляется.
- Метрика — внешний script, после согласия получает технические сетевые сведения.
  Вебвизор/автоцели нужно оставить отключёнными также в Dashboard.
- Публичный health — дешёвый запрос БД, но может быть вызван чаще UptimeRobot.
  Проверить фактические лимиты/free-tier usage; health не заменяет весь набор тестов.
- Нет доступа к настройкам retention/алертов Logs, backup и Security Advisor
  Supabase; это не обозначается как обнаруженная уязвимость.

## 11. Рекомендации

Выполнить [ручной порядок настройки](integration_documentation.md#5-ручная-настройка-сервисов),
зафиксировать успешный run/production URL, протестировать Google двумя разными
Auth-пользователями, события с согласием/отказом и доставку UptimeRobot email.
Применить только новую health RPC, сверить её grants и прежние policies в Dashboard.
Периодически запускать audit/CI и обновлять зависимости после проверки изменений.
Хранить Vercel token только в предназначенном secret store, с подходящим scope
и сроком действия; Google secret — в Supabase provider. При **подтверждённой**
компрометации отзывать соответствующий секрет через владельца, не менять аккаунт
по гипотетическому риску. Не ослаблять RLS ради устранения 401/503.

## 12. Результаты использования Codex при аудите

Codex прочитал код/документы и исходное ДЗ6, выполнил online audit, связал
результаты с фактическими dependency chains, обновил уязвимые пакеты и проверил
типизацию, lint, SQL, SDK/RTL, браузер и реальную двухпользовательскую RLS.
Проверены отсутствие raw пользовательских полей в аналитике/логах и запрет admin
ключей в frontend. Предположения отделены от результатов инструментов; обхода
RLS через административный доступ не было. Промпт и учебный анализ JSONL находятся
в разделе 7 документации интеграций. Реального production-инцидента в отчёте нет.

**Готово и проверено:** аудит и исправления найденных зависимостей, локальные
проверки, live RLS. **Реализовано, но ожидает ручной настройки:** production
интеграции и эксплуатационные проверки. **Не выполнено / есть проблема:**
подтверждение всех внешних интеграций до действий владельца. Полная сдача ДЗ6
до этого не заявляется.
