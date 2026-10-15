# BookTrack

Личная библиотека: книги, статусы чтения, оценка, заметки, поиск и фильтрация.
React + TypeScript + Vite + Tailwind; Supabase PostgreSQL + Auth + RLS.
Сохранена концепция [Minimal Library](docs/ui_concepts/ui_description.md).

## ДЗ6 — CI/CD и интеграции

[Приложение](https://booktrack-one.vercel.app) ·
[Health Check](https://booktrack-one.vercel.app/api/health) ·
[GitHub Actions](https://github.com/sergogaset/BookTrack/actions/workflows/ci-cd.yml).

**Готово и проверено:** деплой на Vercel через GitHub Actions, GitHub OAuth через
Supabase, личная библиотека/RLS, Health Check, UptimeRobot, JSON-логи и аудит.
**Реализовано, ожидает проверки:** код Яндекс.Метрики с согласием пользователя.
**Не выполнено:** внешняя настройка Метрики и подтверждение доставки событий
(отложены владельцем). ДЗ6 целиком пока не завершено.

[Документация интеграций и чек-лист](docs/integration_documentation.md) ·
[Аудит и открытые риски](docs/security_audit.md).
В полном npm audit остаются 7 находок инструментов сборки; в production-зависимостях — 0.
Проверка почты Supabase пропущена по решению владельца; подтверждение email сейчас отключено.

ДЗ5 реализовано и проверено с реальным Supabase: 33 проверки API/RLS двумя
подтверждёнными пользователями и 14 проверок production-интерфейса прошли.
Миграция применена владельцем; данные сохраняются после перезагрузки и повторного
входа. Чужой и анонимный CRUD запрещён. Тестовые книги удалены после проверок.
Фактические результаты, ограничения и все девять шагов — в
[обязательном отчёте ДЗ5](docs/backend_documentation.md).

## Локальный запуск

Используйте Node.js 24 и совместимый npm. Финальные локальные проверки выполнены
на Node 24.22.0; GitHub Actions также использует Node 24.

```sh
npm ci
npm run dev
```

В `.env.local` должны быть `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
В текущей рабочей копии они уже настроены; повторно создавать проект не требуется.
Для нового клона возьмите имена из [.env.example](.env.example) и заполните локально.
После изменения окружения перезапустите Vite. Не публикуйте `.env.local`, токены,
пароли или административные ключи. В браузер передаётся только publishable key.

Откройте адрес Vite, обычно http://127.0.0.1:5173. В текущем Supabase миграция
уже применена владельцем: **повторно её не запускайте**. Для нового проекта
смотрите [миграцию](supabase/migrations/20261015000100_create_books.sql) и
[инструкцию SQL Editor](docs/backend_documentation.md#развёртывание-и-подтверждение-миграции).
В Auth → URL Configuration настройте Site URL и разрешённый Redirect URL
`http://127.0.0.1:5173` (либо фактический origin). В текущем Supabase подтверждение
email отключено; почтовые проверки отложены владельцем. Доступны существующий
email/password вход и кнопка «Войти через GitHub». OAuth на новом origin требует
добавления этого точного адреса в Redirect URLs Supabase; подробности — в документации ДЗ6.

## Проверки

```sh
npm test
npm run test:sql
npm run typecheck
npm run lint
npm run build
npm run check:browser
npm run check:supabase
npm run test:integration
npm run check:browser:live
npm run preview
```

`test:sql` выполняет настоящую миграцию на PostgreSQL/PGlite в памяти: роли A/B
и anon, ограничения и права. Supabase Auth/JWT accessor там имитируется;
этот тест не доказывает развёртывание или RLS удалённого проекта.

`check:browser` использует установленный Edge, Vite и production preview,
проверяет 320/768/1280, Auth/CRUD/перезагрузку с перехваченными HTTP-ответами.
Результаты и скриншоты: [docs/images/hw5/](docs/images/hw5/browser-results.json).
Для другого браузера задайте `BOOKTRACK_BROWSER_PATH`. Live Supabase этим тестом
не проверяется. Исторические артефакты ДЗ4 в `docs/images/hw4/` сохранены.

`check:supabase` делает только безопасные запросы доступности/Auth/CORS.
`test:integration` требует двух отдельных подтверждённых тестовых аккаунтов:
переменные и точный порядок описаны в [отчёте](docs/backend_documentation.md).
При отсутствии аккаунтов скрипт завершает работу с exit 2, а не фиктивным успехом.
`check:browser:live` после сборки запускает production preview на 4175 и Edge,
выполняет сценарий с реальным Supabase без подмены HTTP. Изменяются только новые
тестовые книги. Результаты: [API/RLS](docs/images/hw5/live-api-results.json) и
[production UI](docs/images/hw5/live-browser-results.json). Секреты берутся из
игнорируемого `.env.integration.local`; значения не публикуются.
ESLint настроен. На финальной проверке ДЗ6 прошли 112 тестов и 37 SQL-проверок;
[15 проверок публичного UI](docs/audit/final-browser-results.json) выполнены отдельно
с реальным Supabase. `npm audit` и `npm audit --omit=dev` дают разные результаты:
7 и 0 находок соответственно, см. [итоговый JSON](docs/audit/final-npm-audit.json).
Автоматический `npm audit fix --force` не применяется.

## Структура

- `src/domain/` — Book, BookInput, статусы и общая валидация.
- `src/data/` — контракт репозитория, Supabase SDK, Auth, безопасные ошибки;
  mock-репозиторий сохранён для тестов.
- `src/AuthenticatedApp.tsx` — сессия, вход/выход и граница личных данных.
- `src/App.tsx`, `src/components/`, `src/hooks/` — существующая библиотека и формы.
- `supabase/migrations/` — воспроизводимый SQL, RLS и права на столбцы.
- `scripts/` — локальный SQL, браузерные и live-интеграционные проверки.
- `src/analytics/` — необязательная Метрика; без настройки счётчик не загружается.
- `api/health.ts`, `server/` — серверная проверка доступности для Vercel.
- `shared/` — JSON-логирование с разрешёнными полями.
- `.github/workflows/ci-cd.yml` — CI и production-деплой после push в main.
- `docs/` — [навигация ДЗ1–ДЗ6](docs/README.md),
  [ТЗ](docs/technical_specification.md), [отчёт ДЗ4](docs/development_report.md).

Данные сохраняются в PostgreSQL после успешного применения миграции. При
неоднозначном исходе записи форма предлагает закрыть её и сверить список,
блокируя повторное сохранение. Смена аккаунта очищает библиотеку и черновики.

Репозиторий: [sergogaset/BookTrack](https://github.com/sergogaset/BookTrack).
Frontend и изменения этапа 6 опубликованы:
[успешный CI/CD](https://github.com/sergogaset/BookTrack/actions/runs/38822685700).
Итоговая документация этапа 7 подготовлена локально и ожидает публикации через PR.
