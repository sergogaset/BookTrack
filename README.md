# BookTrack

Личная библиотека: книги, статусы чтения, оценка, заметки, поиск и фильтрация.
React + TypeScript + Vite + Tailwind; Supabase PostgreSQL + Auth + RLS.
Сохранена концепция [Minimal Library](docs/ui_concepts/ui_description.md).

ДЗ5 реализовано и проверено с реальным Supabase: 33 проверки API/RLS двумя
подтверждёнными пользователями и 14 проверок production-интерфейса прошли.
Миграция применена владельцем; данные сохраняются после перезагрузки и повторного
входа. Чужой и анонимный CRUD запрещён. Тестовые книги удалены после проверок.
Фактические результаты, ограничения и все девять шагов — в
[обязательном отчёте ДЗ5](docs/backend_documentation.md).

## Локальный запуск

Рекомендуется поддерживаемый Node.js 22 LTS и npm. Локальные проверки выполнены
на имеющемся Node 18.15 / npm 9.5; эта версия Node устарела.

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
`http://127.0.0.1:5173` (либо фактический origin). Подтверждение email включено:
зарегистрируйтесь, перейдите по ссылке из письма и войдите.

## Проверки

```sh
npm test
npm run test:sql
npm run typecheck
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
Lint не настроен. Автоматический `npm audit fix --force` не применяется.

## Структура

- `src/domain/` — Book, BookInput, статусы и общая валидация.
- `src/data/` — контракт репозитория, Supabase SDK, Auth, безопасные ошибки;
  mock-репозиторий сохранён для тестов.
- `src/AuthenticatedApp.tsx` — сессия, вход/выход и граница личных данных.
- `src/App.tsx`, `src/components/`, `src/hooks/` — существующая библиотека и формы.
- `supabase/migrations/` — воспроизводимый SQL, RLS и права на столбцы.
- `scripts/` — локальный SQL, браузерные и live-интеграционные проверки.
- `docs/` — [навигация ДЗ1–ДЗ5](docs/README.md),
  [ТЗ](docs/technical_specification.md), [отчёт ДЗ4](docs/development_report.md).

Данные сохраняются в PostgreSQL после успешного применения миграции. При
неоднозначном исходе записи форма предлагает закрыть её и сверить список,
блокируя повторное сохранение. Смена аккаунта очищает библиотеку и черновики.

Репозиторий: [sergogaset/BookTrack](https://github.com/sergogaset/BookTrack).
Изменения текущей сессии ещё не опубликованы. Адрес размещённого frontend неизвестен;
инструкции локального запуска являются артефактом сдачи. OAuth, CI/CD и аналитика
относятся к финальному заданию.
