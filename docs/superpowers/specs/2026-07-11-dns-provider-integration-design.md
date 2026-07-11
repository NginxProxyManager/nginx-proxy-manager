# Дизайн: авто-управление DNS-записями через внешнего провайдера (Selectel)

- **Дата:** 2026-07-11
- **Профиль:** business-feature
- **Ветка:** feature/dns-provider-integration
- **Статус:** утверждён к реализации

## Цель

При создании / изменении / удалении **proxy-host** автоматически создавать, синхронизировать и удалять DNS-записи (тип `A`) во внешнем DNS-провайдере. Первый и пока единственный драйвер — **Selectel DNS Hosting (актуальный) API v2**. Провайдер к нему уже подключён в проекте как certbot DNS-plugin (`selectelv2`) для выпуска SSL, но прямого клиента управления записями нет — его и строим.

## Область (scope)

**В scope:**
- Только тип хоста **proxy-host**.
- Только провайдер **Selectel** (через драйверный слой, готовый к расширению).
- Только запись типа **A** на **вручную заданный** публичный IPv4 сервера.
- Жизненный цикл **Create / Update / Delete**; трогаем **только свои** записи (учёт в БД).

**Вне scope:**
- redirection-host, dead-host, stream (домены есть у первых двух — расширение позже, тем же механизмом).
- AAAA / CNAME / прочие типы записей, авто-определение IP.
- Автосоздание DNS-зон (зона должна существовать в аккаунте Selectel).
- Шифрование credentials в БД (проект хранит creds сертификатов в открытом виде — тот же уровень).

## Принятые решения (из brainstorming)

| Вопрос | Решение |
|--------|---------|
| Модель доступа к провайдеру | Отдельная сущность **DNS Provider** (таблица + CRUD), хост ссылается на неё |
| Target записи | A-запись на публичный IP сервера, **задаётся вручную** |
| Охват типов хостов | Только **proxy-host** |
| Поведение при ошибке DNS API | Хост **создаётся всегда**, DNS-статус пишется в `meta` (по образцу `nginx_online`/`nginx_err`) |
| Жизненный цикл | Create/Update/Delete, синхронизируем и трогаем **только свои** записи |
| Резолв зоны | **Longest-suffix match** среди зон проекта, без авто-создания зоны |
| Формат credentials | Как у certbot `selectelv2`: `account_id / project_name / username / password` |

## Архитектура

Вписывается в существующий слой `route → internal → model`. Вся DNS-логика в `internal/`, изолирована за интерфейсом драйвера.

```
backend/
  routes/nginx/dns_providers.js     CRUD провайдеров (образец: routes/nginx/access_lists.js)
  internal/dns-provider.js          бизнес-логика CRUD + test connection
  internal/dns-record.js            sync(host) / cleanup(host) — оркестрация записей
  internal/dns/index.js             диспетчер драйверов по type
  internal/dns/selectel.js          драйвер: Keystone-auth, zones, rrset
  models/dns_provider.js            Objection-модель (образец: models/access_list.js)
  migrations/<ts>_dns_provider.js   таблица dns_provider + колонка proxy_host.dns_provider_id
  schema/components/dns-provider-object.json
  schema/components/dns-provider-list.json
  schema/paths/...                  OpenAPI-пути для /nginx/dns-providers
frontend/src/
  api/backend/*                     CRUD-вызовы DNS Provider
  pages / modules / modals          раздел "DNS Providers" + поле в форме proxy-host
  locale/src                        i18n-строки
```

## Модель данных

### Новая таблица `dns_provider`

По образцу `access_list` (owner, is_deleted, meta):

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | integer PK | |
| `created_on` / `modified_on` | datetime | |
| `owner_user_id` | integer | владелец (как у остальных сущностей) |
| `is_deleted` | tinyint | soft-delete |
| `name` | string | человекочитаемое имя |
| `type` | string | `"selectel"` (enum, расширяемо) |
| `credentials` | JSON | `{account_id, project_name, username, password}` |
| `default_ip` | string | целевой IPv4 для A-записей |
| `ttl` | integer | дефолт `300` |
| `meta` | JSON | статус последней проверки соединения (`last_check`, `error`) |

`credentials` хранится как есть (тот же уровень защиты, что и `certificate.meta.dns_provider_credentials`). В API-ответах `credentials` **омитируется** из выдачи (как `meta.dns_provider_credentials` в `internal/certificate.js` через `omissions()`).

### Изменения `proxy_host`

- Новая колонка `dns_provider_id` (integer, nullable, default `0`). `0`/null = DNS-автоматизация выключена → полная обратная совместимость.
- Relation `dns_provider` в `models/proxy_host.js` (HasOneRelation, аналогично `certificate`).
- В `meta` (уже `jsonAttributes`):
  - `dns_synced: boolean`
  - `dns_err: string | null`
  - `dns_records: [{ domain, zone_id, rrset_id }]` — учёт **только своих** записей для точечного update/delete.

Миграция должна работать на **SQLite, MySQL/MariaDB, Postgres** (правило проекта).

## Поток выполнения

Хуки в `internal/proxy-host.js`, всегда **после** успешного `internalNginx.configure(...)`:

- **create** (~строка 88): если `dns_provider_id` задан → `internalDnsRecord.sync(host)`.
- **update** (~строка 217): `sync(host)` — диффует старые/новые `domain_names` через `meta.dns_records`; создаёт недостающие, удаляет исчезнувшие. Смена `dns_provider_id`: `cleanup` у старого провайдера + `sync` у нового.
- **delete** (~строка 275): `cleanup(host)` — удаляет все записи из `meta.dns_records`.
- **enable / disable**: DNS не трогаем (не зависит от `enabled`).

### Обработка ошибок

`sync` / `cleanup` **никогда не блокируют** операцию с хостом:
- ошибка ловится → `meta.dns_err = <message>`, `meta.dns_synced = false`, событие в audit-log;
- успех → `meta.dns_synced = true`, `meta.dns_err = null`.

Паттерн полностью повторяет обработку `nginx_online` / `nginx_err` в `internal/nginx.js`.

## Драйвер Selectel (`internal/dns/selectel.js`)

Интерфейс драйвера (единый для будущих провайдеров):

```
testConnection(provider)            → { ok, error? }
syncRecord(provider, domain, ip)    → { zone_id, rrset_id }
deleteRecord(provider, record)      → void   // record = {domain, zone_id, rrset_id}
```

Реализация Selectel:

1. **Auth (Keystone):** `POST https://cloud.api.selectel.ru/identity/v3/auth/tokens`
   - scope: domain = `account_id`, user/password, project по `project_name` → project-scoped `X-Auth-Token`.
   - Токен кэшируется в памяти по TTL (Keystone-токен живёт ~сутки); не запрашивается на каждую запись.
2. **Zone resolve:** `GET https://api.selectel.ru/domains/v2/zones`
   - выбрать зону по **longest-suffix match** (`app.example.com` → `example.com`).
   - зона не найдена → ошибка в `dns_err` (зоны не создаём).
3. **Create rrset:** `POST /domains/v2/zones/{zone_id}/rrset`
   ```json
   { "name": "app.example.com.", "type": "A", "ttl": 300,
     "records": [{ "content": "<default_ip>", "disabled": false }] }
   ```
   → сохранить `id` как `rrset_id`.
4. **Delete rrset:** `DELETE /domains/v2/zones/{zone_id}/rrset/{rrset_id}`.

HTTP — через существующий в проекте `proxy-agent` + `fetch`. Все имена записей — FQDN с завершающей точкой.

## Frontend

- Новый раздел **DNS Providers**: список + модалка создания/редактирования, кнопка **Test connection** (дёргает `internal/dns-provider.testConnection`). Образец — существующие сущности на Tabler + TanStack Query.
- Форма proxy-host: селект **DNS Provider** (опционально, «None» по умолчанию) + индикатор статуса DNS (успех / ошибка с тултипом `dns_err`), аналогично индикатору `nginx_online`.
- i18n: строки в `locale/src`, прогон `yarn locale-compile` / `check-locales.cjs`.

## Тестирование

- **Backend (юнит):**
  - `internal/dns/selectel.js` с мок-HTTP: цепочка auth → zones → rrset; кэш токена.
  - longest-suffix resolver зоны (несколько зон, поддомены).
  - `internal/dns-record.sync` diff: добавление/удаление доменов, смена провайдера.
- **E2E (Cypress):** CRUD DNS Provider + создание proxy-host с провайдером; Selectel API замокан / стаб в CI-стеке.
- Biome lint (табы), `yarn validate-schema` для OpenAPI.

## Риски

- Credentials в БД в открытом виде — общее свойство проекта (см. certs), отдельное шифрование не вводим.
- Рассинхрон, если запись изменена вручную в панели Selectel: ведём учёт по своим `rrset_id`, чужое не трогаем — возможны дубли/расхождения, отражаются в `dns_err`.
- Зависимость от доступности Selectel API при create/update: не блокирует хост, но статус будет «не синхронизировано» до ручного повтора.
