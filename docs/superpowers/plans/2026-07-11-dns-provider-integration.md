# DNS Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При create/update/delete proxy-host автоматически создавать/синхронизировать/удалять DNS `A`-записи во внешнем провайдере (Selectel DNS v2), через новую сущность DNS Provider.

**Architecture:** Новая admin-only CRUD-сущность `dns_provider` (таблица + модель + роут). DNS-логика в `internal/`, изолирована за интерфейсом драйвера (`internal/dns/*`). Хуки в `internal/proxy-host.js` вызывают `internal/dns-record.js` после `internalNginx.configure`, ошибки не блокируют хост, статус пишется в `proxy_host.meta`.

**Tech Stack:** Node ESM, Express 5, Objection/Knex (SQLite/MySQL/Postgres), Selectel DNS v2 API (Keystone IAM auth), vitest (новый backend test-раннер), React 19 + Tabler + TanStack Query + Formik.

## Global Constraints

- Backend — ESM (`"type": "module"`): только `import`, расширения `.js` в путях импорта обязательны.
- Все миграции обязаны работать на **SQLite, MySQL/MariaDB, Postgres**. Bool-поля хранятся как `tinyint`/`integer` (см. `convertBoolFieldsToInt`).
- Форматирование — **Biome, табы** (`yarn lint` в каждом пакете). Не использовать пробельную индентацию.
- Credentials провайдера **омитируются** из всех API-ответов (по образцу `omissions()` в `internal/certificate.js`).
- Формат Selectel credentials — как у certbot `selectelv2`: `account_id`, `project_name`, `username`, `password`.
- DNS Provider — **admin-only** (permission JSON = `{"anyOf":[{"$ref":"roles#/definitions/admin"}]}`, как `settings-update.json`). Никаких изменений `user_permission`/`lib/access.js`.
- Целевая запись: только тип `A`, content = `default_ip` провайдера. Имена записей — FQDN с завершающей точкой.
- Selectel DNS v2 base URL: `https://api.selectel.ru/domains/v2`. Keystone auth: `https://cloud.api.selectel.ru/identity/v3/auth/tokens`.
- Спека: `docs/superpowers/specs/2026-07-11-dns-provider-integration-design.md`.

---

## File Structure

**Backend — создать:**
- `backend/vitest.config.js` — конфиг тест-раннера
- `backend/internal/dns/selectel.js` — драйвер Selectel (auth/zones/rrset)
- `backend/internal/dns/index.js` — диспетчер драйверов по `type`
- `backend/internal/dns-record.js` — `sync(host)`/`cleanup(host)` + longest-suffix
- `backend/internal/dns-provider.js` — CRUD + `testConnection`
- `backend/models/dns_provider.js` — Objection-модель
- `backend/migrations/20260712000000_dns_provider.js` — таблица + колонка
- `backend/routes/nginx/dns_providers.js` — REST-роуты
- `backend/lib/access/dns_providers-{list,get,create,update,delete}.json` — permission (admin-only)
- `backend/schema/components/dns-provider-object.json`, `dns-provider-list.json`
- `backend/schema/paths/nginx/dns-providers/{get,post}.json`
- `backend/schema/paths/nginx/dns-providers/providerID/{get,put,delete}.json`
- `backend/schema/paths/nginx/dns-providers/providerID/test/get.json`
- Тесты: `backend/internal/dns/selectel.test.js`, `backend/internal/dns-record.test.js`

**Backend — изменить:**
- `backend/package.json` — devDep `vitest`, script `"test"`
- `backend/models/proxy_host.js` — relation `dns_provider`, `defaultAllowGraph`, `defaultExpand`
- `backend/internal/proxy-host.js` — хуки create/update/delete + `omissions()`
- `backend/routes/main.js` — монтирование `/nginx/dns-providers`
- `backend/schema/swagger.json` — регистрация путей + ссылки на компоненты
- `backend/schema/paths/nginx/proxy-hosts/{post.json,providerID/put.json}` — поле `dns_provider_id`

**Frontend — создать:**
- `frontend/src/api/backend/{getDnsProviders,getDnsProvider,createDnsProvider,updateDnsProvider,deleteDnsProvider,testDnsProvider}.ts`
- `frontend/src/modals/DnsProviderModal.tsx`
- `frontend/src/pages/Nginx/DnsProviders/` (страница списка) — либо раздел внутри существующей Nginx-навигации

**Frontend — изменить:**
- `frontend/src/api/backend/models.ts`, `expansions.ts`, `index.ts`, `modals/index.ts`
- `frontend/src/Router.tsx` — маршрут списка провайдеров + пункт навигации
- `frontend/src/modals/ProxyHostModal.tsx` — селект DNS Provider + индикатор статуса
- `frontend/src/locale/src/en.json` (+ прогон `locale-compile`)

**Test — создать:**
- `test/cypress/e2e/DnsProviders.cy.js`

---

## Phase 0 — Backend test infrastructure

### Task 1: Добавить vitest в backend

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.js`

**Interfaces:**
- Produces: команда `yarn test` в `backend/`, окружение `node`.

- [ ] **Step 1: Добавить devDependency и script**

В `backend/package.json` в `"scripts"` добавить строку:
```json
"test": "vitest run",
```
В `"devDependencies"` добавить:
```json
"vitest": "^4.1.8",
```

- [ ] **Step 2: Создать `backend/vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["**/*.test.js"],
		exclude: ["node_modules/**"],
	},
});
```

- [ ] **Step 3: Установить зависимость**

Run: `cd backend && yarn install`
Expected: vitest появляется в `node_modules`, ошибок нет.

- [ ] **Step 4: Smoke — раннер запускается**

Run: `cd backend && yarn test`
Expected: `No test files found` (тестов ещё нет) — команда завершается без падения.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/vitest.config.js backend/yarn.lock
git commit -m "chore(backend): add vitest test runner"
```

---

## Phase 1 — Data model

### Task 2: Миграция — таблица `dns_provider` + колонка `proxy_host.dns_provider_id`

**Files:**
- Create: `backend/migrations/20260712000000_dns_provider.js`

**Interfaces:**
- Produces: таблица `dns_provider(id, created_on, modified_on, owner_user_id, is_deleted, name, type, credentials, default_ip, ttl, meta)`; колонка `proxy_host.dns_provider_id integer notNull default 0`.

- [ ] **Step 1: Написать миграцию**

```js
import { migrate as logger } from "../logger.js";

const migrateName = "dns_provider";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("dns_provider", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.string("name").notNull();
			table.string("type").notNull();
			table.json("credentials").notNull();
			table.string("default_ip").notNull().defaultTo("");
			table.integer("ttl").notNull().unsigned().defaultTo(300);
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] dns_provider Table created`);
			return knex.schema.alterTable("proxy_host", (table) => {
				table.integer("dns_provider_id").notNull().unsigned().defaultTo(0);
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.dropColumn("dns_provider_id");
		})
		.then(() => knex.schema.dropTable("dns_provider"));
};

export { up, down };
```

- [ ] **Step 2: Прогнать миграцию на sqlite**

Run: `cd backend && DB_SQLITE_FILE=/tmp/npm-migrate-test.sqlite NODE_ENV=development node -e "import('./migrate.js').then(m=>m.migrateUp()).then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"`
Expected: вывод содержит `dns_provider Table created`, `proxy_host Table altered`, затем `OK`.

- [ ] **Step 3: Проверить схему**

Run: `sqlite3 /tmp/npm-migrate-test.sqlite ".schema dns_provider" && sqlite3 /tmp/npm-migrate-test.sqlite ".schema proxy_host" | grep dns_provider_id`
Expected: таблица `dns_provider` с полями; строка с `dns_provider_id` в `proxy_host`. Затем `rm /tmp/npm-migrate-test.sqlite`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/20260712000000_dns_provider.js
git commit -m "feat(backend): add dns_provider table and proxy_host.dns_provider_id migration"
```

### Task 3: Модель `dns_provider` + relation в `proxy_host`

**Files:**
- Create: `backend/models/dns_provider.js`
- Modify: `backend/models/proxy_host.js`

**Interfaces:**
- Produces: `DnsProvider` model (`tableName "dns_provider"`, `jsonAttributes ["credentials","meta"]`); relation `dns_provider` на `ProxyHost`.
- Consumes: `models/user.js`, `models/proxy_host.js`.

- [ ] **Step 1: Создать `backend/models/dns_provider.js`**

```js
// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import ProxyHostModel from "./proxy_host.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class DnsProvider extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "DnsProvider";
	}

	static get tableName() {
		return "dns_provider";
	}

	static get jsonAttributes() {
		return ["credentials", "meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "dns_provider.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			proxy_hosts: {
				relation: Model.HasManyRelation,
				modelClass: ProxyHostModel,
				join: {
					from: "dns_provider.id",
					to: "proxy_host.dns_provider_id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
		};
	}
}

export default DnsProvider;
```

- [ ] **Step 2: Добавить relation в `backend/models/proxy_host.js`**

Импорт рядом с прочими (после `import Certificate from "./certificate.js";`):
```js
import DnsProvider from "./dns_provider.js";
```
В `relationMappings` (после блока `certificate: { ... }`) добавить:
```js
			dns_provider: {
				relation: Model.HasOneRelation,
				modelClass: DnsProvider,
				join: {
					from: "proxy_host.dns_provider_id",
					to: "dns_provider.id",
				},
				modify: (qb) => {
					qb.where("dns_provider.is_deleted", 0);
				},
			},
```
В `defaultAllowGraph` добавить `dns_provider`:
```js
	static get defaultAllowGraph() {
		return "[owner,access_list.[clients,items],certificate,dns_provider]";
	}
```

- [ ] **Step 3: Проверить, что модуль грузится без циклов**

Run: `cd backend && node -e "import('./models/dns_provider.js').then(()=>import('./models/proxy_host.js')).then(()=>console.log('OK'))"`
Expected: `OK` (нет ошибок циклического импорта; `proxy_host`↔`dns_provider` уже имеют аналог с `access_list`).

- [ ] **Step 4: Commit**

```bash
git add backend/models/dns_provider.js backend/models/proxy_host.js
git commit -m "feat(backend): add DnsProvider model and proxy_host relation"
```

---

## Phase 2 — Permissions (admin-only)

### Task 4: Permission-схемы DNS Provider

**Files:**
- Create: `backend/lib/access/dns_providers-list.json`, `dns_providers-get.json`, `dns_providers-create.json`, `dns_providers-update.json`, `dns_providers-delete.json`

**Interfaces:**
- Produces: разрешения `dns_providers:{list,get,create,update,delete}` → только admin.

- [ ] **Step 1: Создать пять файлов с идентичным содержимым**

Каждый из пяти файлов (`dns_providers-list.json`, `-get.json`, `-create.json`, `-update.json`, `-delete.json`):
```json
{
	"anyOf": [
		{
			"$ref": "roles#/definitions/admin"
		}
	]
}
```

- [ ] **Step 2: Проверить валидность JSON**

Run: `cd backend && for f in lib/access/dns_providers-*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" && echo "$f ok"; done`
Expected: пять строк `... ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/lib/access/dns_providers-*.json
git commit -m "feat(backend): add admin-only permissions for dns_providers"
```

---

## Phase 3 — Selectel driver (TDD)

### Task 5: Резолвер зоны (longest-suffix) — чистая функция

**Files:**
- Create: `backend/internal/dns/selectel.js`
- Test: `backend/internal/dns/selectel.test.js`

**Interfaces:**
- Produces: экспорт `export const resolveZone = (domain, zones) => zone | null`, где `zones` — массив `{id, name}` (name без завершающей точки), возвращается объект зоны с самым длинным совпадающим суффиксом или `null`.

- [ ] **Step 1: Написать падающий тест**

```js
import { describe, expect, it } from "vitest";
import { resolveZone } from "./selectel.js";

describe("resolveZone", () => {
	const zones = [
		{ id: "z1", name: "example.com" },
		{ id: "z2", name: "sub.example.com" },
		{ id: "z3", name: "other.org" },
	];

	it("matches exact zone", () => {
		expect(resolveZone("example.com", zones)?.id).toBe("z1");
	});

	it("matches subdomain to parent zone", () => {
		expect(resolveZone("app.example.com", zones)?.id).toBe("z1");
	});

	it("prefers the longest matching zone", () => {
		expect(resolveZone("api.sub.example.com", zones)?.id).toBe("z2");
	});

	it("returns null when no zone matches", () => {
		expect(resolveZone("nomatch.net", zones)).toBeNull();
	});

	it("does not match partial label (foobar vs bar)", () => {
		expect(resolveZone("foobarexample.com", [{ id: "z9", name: "barexample.com" }])).toBeNull();
	});
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `cd backend && yarn test internal/dns/selectel.test.js`
Expected: FAIL — `resolveZone is not a function` / модуль не найден.

- [ ] **Step 3: Реализовать `resolveZone` в `selectel.js`**

```js
/**
 * Finds the zone whose name is the longest suffix of the domain.
 * A match requires either an exact equality or a ".zone" boundary,
 * so "foobar.com" does NOT match zone "bar.com".
 *
 * @param {string} domain      e.g. "app.example.com"
 * @param {Array<{id:string,name:string}>} zones
 * @returns {{id:string,name:string}|null}
 */
export const resolveZone = (domain, zones) => {
	const target = String(domain).replace(/\.$/, "").toLowerCase();
	let best = null;
	for (const zone of zones) {
		const name = String(zone.name).replace(/\.$/, "").toLowerCase();
		const isMatch = target === name || target.endsWith(`.${name}`);
		if (isMatch && (best === null || name.length > best.name.length)) {
			best = { ...zone, name };
		}
	}
	return best;
};
```

- [ ] **Step 4: Запустить — тест проходит**

Run: `cd backend && yarn test internal/dns/selectel.test.js`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/dns/selectel.js backend/internal/dns/selectel.test.js
git commit -m "feat(backend): add Selectel longest-suffix zone resolver with tests"
```

### Task 6: Selectel HTTP-драйвер — auth, zones, create/delete rrset

**Files:**
- Modify: `backend/internal/dns/selectel.js`
- Test: `backend/internal/dns/selectel.test.js`

**Interfaces:**
- Consumes: `resolveZone` (Task 5).
- Produces (default export объект):
  - `authenticate(credentials) → Promise<string>` (X-Auth-Token, кэш в модуле по ключу credentials до истечения TTL)
  - `listZones(token) → Promise<Array<{id,name}>>`
  - `createRecord(credentials, domain, ip, ttl) → Promise<{zone_id, rrset_id}>`
  - `deleteRecord(credentials, record) → Promise<void>` где `record = {zone_id, rrset_id}`
  - `testConnection(credentials) → Promise<{ok:boolean, error?:string}>`
- Все HTTP через инъектируемый `fetch` (по умолчанию глобальный `fetch`), чтобы тест мокал сеть.

- [ ] **Step 1: Написать падающие тесты (mock fetch)**

Добавить в `backend/internal/dns/selectel.test.js`:
```js
import { beforeEach, describe, expect, it, vi } from "vitest";
import selectel, { __setFetch, __resetCache } from "./selectel.js";

const creds = { account_id: "111", project_name: "proj", username: "u", password: "p" };

const jsonResponse = (body, init = {}) => ({
	ok: init.status ? init.status < 400 : true,
	status: init.status || 200,
	headers: { get: (h) => (h.toLowerCase() === "x-subject-token" ? "TOKEN123" : null) },
	json: async () => body,
	text: async () => JSON.stringify(body),
});

describe("selectel driver", () => {
	beforeEach(() => {
		__resetCache();
	});

	it("authenticate returns keystone token from x-subject-token header", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }));
		__setFetch(fetchMock);
		const token = await selectel.authenticate(creds);
		expect(token).toBe("TOKEN123");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://cloud.api.selectel.ru/identity/v3/auth/tokens",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("createRecord resolves zone and posts an A rrset", async () => {
		const fetchMock = vi
			.fn()
			// auth
			.mockResolvedValueOnce(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }))
			// list zones
			.mockResolvedValueOnce(jsonResponse({ result: [{ id: "zone-1", name: "example.com" }] }))
			// create rrset
			.mockResolvedValueOnce(jsonResponse({ id: "rrset-9" }));
		__setFetch(fetchMock);

		const res = await selectel.createRecord(creds, "app.example.com", "203.0.113.5", 300);
		expect(res).toEqual({ zone_id: "zone-1", rrset_id: "rrset-9" });

		const [url, opts] = fetchMock.mock.calls[2];
		expect(url).toBe("https://api.selectel.ru/domains/v2/zones/zone-1/rrset");
		const body = JSON.parse(opts.body);
		expect(body).toMatchObject({ name: "app.example.com.", type: "A", ttl: 300 });
		expect(body.records[0].content).toBe("203.0.113.5");
	});

	it("createRecord throws when no zone matches", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }))
			.mockResolvedValueOnce(jsonResponse({ result: [{ id: "z", name: "other.org" }] }));
		__setFetch(fetchMock);
		await expect(selectel.createRecord(creds, "app.example.com", "1.2.3.4", 300)).rejects.toThrow(/zone/i);
	});

	it("deleteRecord issues DELETE to the rrset endpoint", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ token: { expires_at: "2999-01-01T00:00:00Z" } }))
			.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));
		__setFetch(fetchMock);
		await selectel.deleteRecord(creds, { zone_id: "zone-1", rrset_id: "rrset-9" });
		const [url, opts] = fetchMock.mock.calls[1];
		expect(url).toBe("https://api.selectel.ru/domains/v2/zones/zone-1/rrset/rrset-9");
		expect(opts.method).toBe("DELETE");
	});

	it("testConnection returns ok:false with message on auth failure", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad creds" }, { status: 401 }));
		__setFetch(fetchMock);
		const res = await selectel.testConnection(creds);
		expect(res.ok).toBe(false);
		expect(res.error).toBeTruthy();
	});
});
```

- [ ] **Step 2: Запустить — новые тесты падают**

Run: `cd backend && yarn test internal/dns/selectel.test.js`
Expected: FAIL — экспортов `default`, `__setFetch`, `__resetCache` нет.

- [ ] **Step 3: Реализовать драйвер (дописать в `selectel.js`, `resolveZone` уже есть)**

```js
const IDENTITY_URL = "https://cloud.api.selectel.ru/identity/v3/auth/tokens";
const DNS_BASE = "https://api.selectel.ru/domains/v2";

// injectable fetch for tests
let _fetch = (...args) => globalThis.fetch(...args);
export const __setFetch = (fn) => {
	_fetch = fn;
};

// in-memory token cache: key -> { token, expiresAt(ms) }
const tokenCache = new Map();
export const __resetCache = () => tokenCache.clear();

const cacheKey = (c) => `${c.account_id}:${c.project_name}:${c.username}`;

const readError = async (res) => {
	try {
		const body = await res.json();
		return body?.error || body?.description || `HTTP ${res.status}`;
	} catch {
		return `HTTP ${res.status}`;
	}
};

const authenticate = async (credentials) => {
	const key = cacheKey(credentials);
	const cached = tokenCache.get(key);
	if (cached && cached.expiresAt > Date.now() + 60_000) {
		return cached.token;
	}

	const payload = {
		auth: {
			identity: {
				methods: ["password"],
				password: {
					user: {
						name: credentials.username,
						domain: { name: String(credentials.account_id) },
						password: credentials.password,
					},
				},
			},
			scope: {
				project: {
					name: credentials.project_name,
					domain: { name: String(credentials.account_id) },
				},
			},
		},
	};

	const res = await _fetch(IDENTITY_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		throw new Error(`Selectel auth failed: ${await readError(res)}`);
	}
	const token = res.headers.get("x-subject-token");
	if (!token) {
		throw new Error("Selectel auth failed: no token returned");
	}
	const body = await res.json().catch(() => ({}));
	const expiresAt = body?.token?.expires_at ? Date.parse(body.token.expires_at) : Date.now() + 3_600_000;
	tokenCache.set(key, { token, expiresAt });
	return token;
};

const listZones = async (token) => {
	const res = await _fetch(`${DNS_BASE}/zones?limit=1000`, {
		method: "GET",
		headers: { "X-Auth-Token": token },
	});
	if (!res.ok) {
		throw new Error(`Selectel listZones failed: ${await readError(res)}`);
	}
	const body = await res.json();
	// v2 returns { result: [...] } (fallback to array)
	return Array.isArray(body) ? body : body.result || [];
};

const createRecord = async (credentials, domain, ip, ttl) => {
	const token = await authenticate(credentials);
	const zones = await listZones(token);
	const zone = resolveZone(domain, zones);
	if (!zone) {
		throw new Error(`No Selectel DNS zone found for domain "${domain}"`);
	}
	const name = `${String(domain).replace(/\.$/, "")}.`;
	const res = await _fetch(`${DNS_BASE}/zones/${zone.id}/rrset`, {
		method: "POST",
		headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
		body: JSON.stringify({
			name,
			type: "A",
			ttl: ttl || 300,
			records: [{ content: ip, disabled: false }],
		}),
	});
	if (!res.ok) {
		throw new Error(`Selectel createRecord failed: ${await readError(res)}`);
	}
	const body = await res.json();
	return { zone_id: zone.id, rrset_id: body.id };
};

const deleteRecord = async (credentials, record) => {
	const token = await authenticate(credentials);
	const res = await _fetch(`${DNS_BASE}/zones/${record.zone_id}/rrset/${record.rrset_id}`, {
		method: "DELETE",
		headers: { "X-Auth-Token": token },
	});
	// 204 delete, 404 already gone — both acceptable
	if (!res.ok && res.status !== 404) {
		throw new Error(`Selectel deleteRecord failed: ${await readError(res)}`);
	}
};

const testConnection = async (credentials) => {
	try {
		const token = await authenticate(credentials);
		await listZones(token);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err.message };
	}
};

export default { authenticate, listZones, createRecord, deleteRecord, testConnection };
```

- [ ] **Step 4: Запустить — все тесты проходят**

Run: `cd backend && yarn test internal/dns/selectel.test.js`
Expected: PASS (все тесты Task 5 + Task 6).

- [ ] **Step 5: Lint**

Run: `cd backend && yarn lint internal/dns/selectel.js`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/dns/selectel.js backend/internal/dns/selectel.test.js
git commit -m "feat(backend): implement Selectel DNS v2 driver (auth/zones/rrset)"
```

### Task 7: Диспетчер драйверов

**Files:**
- Create: `backend/internal/dns/index.js`

**Interfaces:**
- Consumes: `selectel` default export (Task 6).
- Produces: `export const getDriver = (type) => driver` (бросает при неизвестном типе); `export const SUPPORTED_TYPES = ["selectel"]`.

- [ ] **Step 1: Реализовать диспетчер**

```js
import selectel from "./selectel.js";

const drivers = {
	selectel,
};

export const SUPPORTED_TYPES = Object.keys(drivers);

/**
 * @param {string} type
 * @returns {{authenticate:Function, listZones:Function, createRecord:Function, deleteRecord:Function, testConnection:Function}}
 */
export const getDriver = (type) => {
	const driver = drivers[type];
	if (!driver) {
		throw new Error(`Unsupported DNS provider type: ${type}`);
	}
	return driver;
};
```

- [ ] **Step 2: Smoke**

Run: `cd backend && node -e "import('./internal/dns/index.js').then(m=>{console.log(m.SUPPORTED_TYPES); m.getDriver('selectel'); try{m.getDriver('x')}catch(e){console.log('threw ok')}})"`
Expected: `[ 'selectel' ]` затем `threw ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/dns/index.js
git commit -m "feat(backend): add DNS driver dispatcher"
```

---

## Phase 4 — Record orchestration (TDD)

### Task 8: `internal/dns-record.js` — diff доменов (чистая часть)

**Files:**
- Create: `backend/internal/dns-record.js`
- Test: `backend/internal/dns-record.test.js`

**Interfaces:**
- Produces: `export const diffDomains = (desired, existingRecords) => ({ toCreate: string[], toDelete: Array<{domain,zone_id,rrset_id}> })`.
  - `desired` — массив доменов хоста; `existingRecords` — `meta.dns_records` (массив `{domain,zone_id,rrset_id}`).
  - `toCreate` = домены из `desired`, которых нет в `existingRecords`.
  - `toDelete` = записи из `existingRecords`, чьих доменов больше нет в `desired`.

- [ ] **Step 1: Написать падающий тест**

```js
import { describe, expect, it } from "vitest";
import { diffDomains } from "./dns-record.js";

describe("diffDomains", () => {
	it("creates all when nothing exists", () => {
		const { toCreate, toDelete } = diffDomains(["a.com", "b.com"], []);
		expect(toCreate).toEqual(["a.com", "b.com"]);
		expect(toDelete).toEqual([]);
	});

	it("no-op when identical", () => {
		const existing = [{ domain: "a.com", zone_id: "z", rrset_id: "r" }];
		const { toCreate, toDelete } = diffDomains(["a.com"], existing);
		expect(toCreate).toEqual([]);
		expect(toDelete).toEqual([]);
	});

	it("computes additions and removals on rename", () => {
		const existing = [
			{ domain: "old.com", zone_id: "z", rrset_id: "r1" },
			{ domain: "keep.com", zone_id: "z", rrset_id: "r2" },
		];
		const { toCreate, toDelete } = diffDomains(["keep.com", "new.com"], existing);
		expect(toCreate).toEqual(["new.com"]);
		expect(toDelete).toEqual([{ domain: "old.com", zone_id: "z", rrset_id: "r1" }]);
	});
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd backend && yarn test internal/dns-record.test.js`
Expected: FAIL — `diffDomains is not a function`.

- [ ] **Step 3: Реализовать `diffDomains` (верх `dns-record.js`)**

```js
import _ from "lodash";
import { getDriver } from "./dns/index.js";
import dnsProviderModel from "../models/dns_provider.js";
import { dnsRecord as logger } from "../logger.js";

/**
 * @param {string[]} desired
 * @param {Array<{domain:string,zone_id:string,rrset_id:string}>} existingRecords
 */
export const diffDomains = (desired, existingRecords) => {
	const existingByDomain = _.keyBy(existingRecords || [], "domain");
	const desiredSet = new Set(desired || []);
	const toCreate = (desired || []).filter((d) => !existingByDomain[d]);
	const toDelete = (existingRecords || []).filter((r) => !desiredSet.has(r.domain));
	return { toCreate, toDelete };
};
```

> Примечание: логгер `dnsRecord` добавляется в Task 9 к `logger.js`. Для прохождения теста импорт логгера можно временно опустить и добавить в Task 9 — либо сразу выполнить Task 9 Step про logger. Чтобы избежать сбоя импорта, добавь строку логгера в `logger.js` до запуска (см. Task 9, Step 1).

- [ ] **Step 4: Запустить — проходит**

Run: `cd backend && yarn test internal/dns-record.test.js`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/dns-record.js backend/internal/dns-record.test.js
git commit -m "feat(backend): add domain diff for DNS record sync with tests"
```

### Task 9: `internal/dns-record.js` — `sync`/`cleanup` оркестрация

**Files:**
- Modify: `backend/internal/dns-record.js`
- Modify: `backend/logger.js`

**Interfaces:**
- Consumes: `diffDomains` (Task 8), `getDriver` (Task 7), `DnsProvider` model.
- Produces:
  - `sync(host) → Promise<{dns_synced:boolean, dns_err:string|null, dns_records:Array}>` — host = объект proxy_host с `dns_provider_id`, `domain_names`, `meta`. Возвращает новые DNS-поля для `meta` (НЕ бросает — ошибки в `dns_err`).
  - `cleanup(host) → Promise<void>` — удаляет все `host.meta.dns_records` (не бросает, логирует).
- Контракт: если `dns_provider_id` falsy → `sync` возвращает `{dns_synced:false, dns_err:null, dns_records:[]}` без вызовов.

- [ ] **Step 1: Добавить логгер `dnsRecord` в `backend/logger.js`**

Открыть `backend/logger.js`, найти список создаваемых логгеров (напр. `export const nginx = new Signale({ scope: "Nginx" });`) и добавить рядом:
```js
export const dnsRecord = new Signale({ scope: "DNS" });
```
(Согласовать имя scope/фабрику с существующим стилем файла.)

- [ ] **Step 2: Написать тест на sync/cleanup (мок драйвера и модели)**

Добавить в `backend/internal/dns-record.test.js`:
```js
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./dns/index.js", () => ({
	getDriver: vi.fn(),
}));
vi.mock("../models/dns_provider.js", () => ({
	default: { query: vi.fn() },
}));

import { getDriver } from "./dns/index.js";
import dnsProviderModel from "../models/dns_provider.js";
import { cleanup, sync } from "./dns-record.js";

const provider = {
	id: 1,
	type: "selectel",
	credentials: { account_id: "1", project_name: "p", username: "u", password: "x" },
	default_ip: "203.0.113.5",
	ttl: 300,
};

const mockProvider = () => {
	dnsProviderModel.query.mockReturnValue({
		where: () => ({ first: async () => provider }),
	});
};

afterEach(() => vi.clearAllMocks());

describe("sync", () => {
	it("no-op when host has no provider", async () => {
		const res = await sync({ dns_provider_id: 0, domain_names: ["a.com"], meta: {} });
		expect(res).toEqual({ dns_synced: false, dns_err: null, dns_records: [] });
	});

	it("creates records for new domains and stores rrset ids", async () => {
		mockProvider();
		const createRecord = vi.fn().mockResolvedValue({ zone_id: "z", rrset_id: "r1" });
		getDriver.mockReturnValue({ createRecord, deleteRecord: vi.fn() });

		const res = await sync({ dns_provider_id: 1, domain_names: ["a.com"], meta: {} });

		expect(createRecord).toHaveBeenCalledWith(provider.credentials, "a.com", "203.0.113.5", 300);
		expect(res.dns_synced).toBe(true);
		expect(res.dns_err).toBeNull();
		expect(res.dns_records).toEqual([{ domain: "a.com", zone_id: "z", rrset_id: "r1" }]);
	});

	it("captures error into dns_err without throwing", async () => {
		mockProvider();
		getDriver.mockReturnValue({
			createRecord: vi.fn().mockRejectedValue(new Error("boom")),
			deleteRecord: vi.fn(),
		});
		const res = await sync({ dns_provider_id: 1, domain_names: ["a.com"], meta: {} });
		expect(res.dns_synced).toBe(false);
		expect(res.dns_err).toMatch(/boom/);
	});
});

describe("cleanup", () => {
	it("deletes all recorded rrsets", async () => {
		mockProvider();
		const deleteRecord = vi.fn().mockResolvedValue();
		getDriver.mockReturnValue({ deleteRecord, createRecord: vi.fn() });
		await cleanup({
			dns_provider_id: 1,
			meta: { dns_records: [{ domain: "a.com", zone_id: "z", rrset_id: "r1" }] },
		});
		expect(deleteRecord).toHaveBeenCalledWith(provider.credentials, { zone_id: "z", rrset_id: "r1" });
	});
});
```

- [ ] **Step 3: Запустить — падает**

Run: `cd backend && yarn test internal/dns-record.test.js`
Expected: FAIL — `sync`/`cleanup` не экспортированы.

- [ ] **Step 4: Дописать `sync`/`cleanup` в `dns-record.js`**

```js
const loadProvider = async (providerId) =>
	dnsProviderModel.query().where("id", providerId).where("is_deleted", 0).first();

/**
 * Synchronises DNS A-records for a proxy host with its configured provider.
 * Never throws — failures are returned in dns_err.
 *
 * @param {{dns_provider_id:number, domain_names:string[], meta:object}} host
 * @returns {Promise<{dns_synced:boolean, dns_err:string|null, dns_records:Array}>}
 */
export const sync = async (host) => {
	if (!host.dns_provider_id) {
		return { dns_synced: false, dns_err: null, dns_records: [] };
	}
	const existing = host.meta?.dns_records || [];
	try {
		const provider = await loadProvider(host.dns_provider_id);
		if (!provider) {
			throw new Error(`DNS provider ${host.dns_provider_id} not found`);
		}
		const driver = getDriver(provider.type);
		const { toCreate, toDelete } = diffDomains(host.domain_names || [], existing);

		const kept = existing.filter((r) => !toDelete.includes(r));

		for (const rec of toDelete) {
			await driver.deleteRecord(provider.credentials, { zone_id: rec.zone_id, rrset_id: rec.rrset_id });
		}
		const created = [];
		for (const domain of toCreate) {
			const { zone_id, rrset_id } = await driver.createRecord(
				provider.credentials,
				domain,
				provider.default_ip,
				provider.ttl,
			);
			created.push({ domain, zone_id, rrset_id });
		}
		return { dns_synced: true, dns_err: null, dns_records: [...kept, ...created] };
	} catch (err) {
		logger.error(`sync failed for host domains ${JSON.stringify(host.domain_names)}: ${err.message}`);
		return { dns_synced: false, dns_err: err.message, dns_records: existing };
	}
};

/**
 * Removes all DNS records previously created for a host. Never throws.
 * @param {{dns_provider_id:number, meta:object}} host
 */
export const cleanup = async (host) => {
	if (!host.dns_provider_id) {
		return;
	}
	const existing = host.meta?.dns_records || [];
	if (!existing.length) {
		return;
	}
	try {
		const provider = await loadProvider(host.dns_provider_id);
		if (!provider) {
			return;
		}
		const driver = getDriver(provider.type);
		for (const rec of existing) {
			await driver.deleteRecord(provider.credentials, { zone_id: rec.zone_id, rrset_id: rec.rrset_id });
		}
	} catch (err) {
		logger.error(`cleanup failed: ${err.message}`);
	}
};

export default { diffDomains, sync, cleanup };
```

- [ ] **Step 5: Запустить — всё проходит**

Run: `cd backend && yarn test internal/dns-record.test.js`
Expected: PASS (Task 8 + Task 9 тесты).

- [ ] **Step 6: Lint + commit**

```bash
cd backend && yarn lint internal/dns-record.js logger.js
git add backend/internal/dns-record.js backend/logger.js
git commit -m "feat(backend): add DNS record sync/cleanup orchestration with tests"
```

---

## Phase 5 — DNS Provider CRUD (internal + schema + routes)

### Task 10: `internal/dns-provider.js` — CRUD + testConnection

**Files:**
- Create: `backend/internal/dns-provider.js`

**Interfaces:**
- Consumes: `DnsProvider` model, `getDriver` (Task 7), `internalAuditLog`.
- Produces методы (по образцу `internal/access-list.js`): `create(access,data)`, `update(access,data)`, `get(access,data)`, `delete(access,data)`, `getAll(access,expand,query)`, `getCount(userId)`, `test(access,data)`. Все ответы проходят через `omissions()` = `["credentials"]`.

- [ ] **Step 1: Реализовать модуль**

```js
import _ from "lodash";
import errs from "../lib/error.js";
import { getDriver } from "./dns/index.js";
import internalAuditLog from "./audit-log.js";
import dnsProviderModel from "../models/dns_provider.js";

function omissions() {
	return ["credentials"];
}

const internalDnsProvider = {
	create: (access, data) => {
		return access
			.can("dns_providers:create", data)
			.then(() => {
				return dnsProviderModel
					.query()
					.insertAndFetch({
						...data,
						owner_user_id: access.token.getUserId(1),
						meta: data.meta || {},
					})
					.then(utilsOmit);
			})
			.then((row) => {
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "dns-provider",
						object_id: row.id,
						meta: _.omit(row, omissions()),
					})
					.then(() => row);
			});
	},

	update: (access, data) => {
		return access
			.can("dns_providers:update", data.id)
			.then(() => internalDnsProvider.get(access, { id: data.id }))
			.then((row) => {
				if (row.id !== data.id) {
					throw new errs.InternalValidationError(`DNS Provider could not be updated, IDs do not match`);
				}
				return dnsProviderModel
					.query()
					.where("id", data.id)
					.patchAndFetchById(data.id, _.omit(data, ["id"]))
					.then(utilsOmit);
			})
			.then((row) => {
				return internalAuditLog
					.add(access, {
						action: "updated",
						object_type: "dns-provider",
						object_id: row.id,
						meta: _.omit(data, omissions()),
					})
					.then(() => row);
			});
	},

	get: (access, data) => {
		const thisData = data || {};
		return access.can("dns_providers:get", thisData.id).then(() => {
			const query = dnsProviderModel
				.query()
				.where("is_deleted", 0)
				.andWhere("id", thisData.id)
				.first();
			if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
				query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
			}
			return query.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				return _.omit(row, omissions());
			});
		});
	},

	delete: (access, data) => {
		return access
			.can("dns_providers:delete", data.id)
			.then(() => internalDnsProvider.get(access, { id: data.id }))
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				return dnsProviderModel
					.query()
					.where("id", row.id)
					.patch({ is_deleted: 1 })
					.then(() =>
						internalAuditLog.add(access, {
							action: "deleted",
							object_type: "dns-provider",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						}),
					);
			})
			.then(() => true);
	},

	getAll: (access, expand, searchQuery) => {
		return access.can("dns_providers:list").then(() => {
			const query = dnsProviderModel.query().where("is_deleted", 0).orderBy("name", "ASC");
			if (typeof searchQuery === "string" && searchQuery.length > 0) {
				query.where((qb) => {
					qb.where("name", "like", `%${searchQuery}%`);
				});
			}
			if (typeof expand !== "undefined" && expand !== null) {
				query.withGraphFetched(`[${expand.join(", ")}]`);
			}
			return query.then((rows) => rows.map((r) => _.omit(r, omissions())));
		});
	},

	getCount: (userId) => {
		return dnsProviderModel
			.query()
			.count("id as count")
			.where("is_deleted", 0)
			.first()
			.then((row) => Number.parseInt(row.count, 10));
	},

	test: (access, data) => {
		return access
			.can("dns_providers:get", data.id)
			.then(() => dnsProviderModel.query().where("is_deleted", 0).andWhere("id", data.id).first())
			.then((row) => {
				if (!row?.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				return getDriver(row.type).testConnection(row.credentials);
			});
	},
};

const utilsOmit = (row) => _.omit(row, omissions());

export default internalDnsProvider;
```

> Проверить точные имена ошибок в `backend/lib/error.js` (`InternalValidationError`, `ItemNotFoundError`) и метод `access.token.getUserId(1)` по образцу `internal/access-list.js` — при расхождении привести в соответствие.

- [ ] **Step 2: Smoke-загрузка модуля**

Run: `cd backend && node -e "import('./internal/dns-provider.js').then(m=>console.log(typeof m.default.create==='function'?'OK':'BAD'))"`
Expected: `OK`.

- [ ] **Step 3: Lint + commit**

```bash
cd backend && yarn lint internal/dns-provider.js
git add backend/internal/dns-provider.js
git commit -m "feat(backend): add dns-provider CRUD internal logic"
```

### Task 11: OpenAPI-схемы DNS Provider (components + paths + swagger)

**Files:**
- Create: `backend/schema/components/dns-provider-object.json`, `dns-provider-list.json`
- Create: `backend/schema/paths/nginx/dns-providers/{get,post}.json`, `.../providerID/{get,put,delete}.json`, `.../providerID/test/get.json`
- Modify: `backend/schema/swagger.json`

**Interfaces:**
- Produces: пути `/nginx/dns-providers`, `/nginx/dns-providers/{providerID}`, `/nginx/dns-providers/{providerID}/test`. POST/PUT bodies с полями `name`, `type`, `credentials`, `default_ip`, `ttl`.

- [ ] **Step 1: `components/dns-provider-object.json`**

Скопировать структуру `backend/schema/components/certificate-object.json` (обёртка `{ "type":"object", "properties": {...}, "required": [...] }`) и определить свойства:
```json
{
	"type": "object",
	"additionalProperties": false,
	"required": ["id", "name", "type"],
	"properties": {
		"id": { "type": "integer", "minimum": 1 },
		"created_on": { "type": "string" },
		"modified_on": { "type": "string" },
		"owner_user_id": { "type": "integer" },
		"name": { "type": "string", "minLength": 1, "maxLength": 100 },
		"type": { "type": "string", "enum": ["selectel"] },
		"default_ip": { "type": "string" },
		"ttl": { "type": "integer", "minimum": 60, "maximum": 604800 },
		"meta": { "type": "object" }
	}
}
```
(Заметь: `credentials` в объекте-ответе НЕ описываем — оно омитируется.)

- [ ] **Step 2: `components/dns-provider-list.json`**

По образцу `certificate-list.json`:
```json
{
	"type": "array",
	"items": { "$ref": "./dns-provider-object.json" }
}
```

- [ ] **Step 3: `paths/nginx/dns-providers/get.json`**

Скопировать `paths/nginx/access-lists/get.json`, заменив теги/описания на DNS Providers и `$ref` ответа на `dns-provider-list.json`.

- [ ] **Step 4: `paths/nginx/dns-providers/post.json`**

Скопировать `paths/nginx/access-lists/post.json`; requestBody schema:
```json
{
	"type": "object",
	"additionalProperties": false,
	"required": ["name", "type", "credentials", "default_ip"],
	"properties": {
		"name": { "type": "string", "minLength": 1, "maxLength": 100 },
		"type": { "type": "string", "enum": ["selectel"] },
		"credentials": {
			"type": "object",
			"required": ["account_id", "project_name", "username", "password"],
			"properties": {
				"account_id": { "type": "string" },
				"project_name": { "type": "string" },
				"username": { "type": "string" },
				"password": { "type": "string" }
			}
		},
		"default_ip": { "type": "string", "minLength": 1 },
		"ttl": { "type": "integer", "minimum": 60, "maximum": 604800 }
	}
}
```

- [ ] **Step 5: providerID `get/put/delete/test`**

- `providerID/get.json` и `providerID/delete.json` — по образцу `access-lists/listID/{get,delete}.json` (path-параметр `providerID`).
- `providerID/put.json` — как post.json, но все свойства опциональны (`required` убрать), `additionalProperties:false`.
- `providerID/test/get.json` — ответ `{ ok: boolean, error?: string }`, tag DNS Providers.

- [ ] **Step 6: Зарегистрировать пути в `swagger.json`**

В объекте `paths` добавить ключи (по образцу существующих `$ref` на файлы):
```json
"/nginx/dns-providers": { "$ref": "./paths/nginx/dns-providers/get.json" },
```
> ВНИМАНИЕ: в swagger.json один путь = один `$ref` на файл, а файл содержит несколько методов (get+post в одном файле, как у access-lists). Проверь, как именно склеены методы у access-lists (`get.json` и `post.json` — как они оба попадают в `/nginx/access-lists`), и повтори тот же механизм. Если методы объединяются в одном файле — объединить get+post и get+put+delete аналогично.

- [ ] **Step 7: Валидировать схему**

Run: `cd backend && yarn validate-schema`
Expected: без ошибок (схема дереференсится).

- [ ] **Step 8: Commit**

```bash
git add backend/schema/components/dns-provider-*.json backend/schema/paths/nginx/dns-providers backend/schema/swagger.json
git commit -m "feat(backend): add OpenAPI schema for dns-providers"
```

### Task 12: Роуты `/nginx/dns-providers` + монтирование

**Files:**
- Create: `backend/routes/nginx/dns_providers.js`
- Modify: `backend/routes/main.js`

**Interfaces:**
- Consumes: `internalDnsProvider` (Task 10), схемы (Task 11).
- Produces: REST-эндпоинты GET/POST `/`, GET/PUT/DELETE `/:provider_id`, GET `/:provider_id/test`.

- [ ] **Step 1: Реализовать роутер**

Скопировать `backend/routes/nginx/access_lists.js`, заменив:
- импорт `internalAccessList` → `internalDnsProvider from "../../internal/dns-provider.js"`
- пути валидатора `"/nginx/access-lists"` → `"/nginx/dns-providers"`
- параметр `:list_id` → `:provider_id`
- вызовы `internalAccessList.*` → `internalDnsProvider.*`
- добавить маршрут `.route("/:provider_id/test").get(...)`, вызывающий `internalDnsProvider.test(res.locals.access, { id: req.params.provider_id })` и возвращающий результат со статусом 200.

- [ ] **Step 2: Смонтировать в `routes/main.js`**

Импорт рядом с прочими nginx-роутами:
```js
import dnsProvidersRoutes from "./nginx/dns_providers.js";
```
Монтирование (после строки `router.use("/nginx/access-lists", accessListsRoutes);`):
```js
router.use("/nginx/dns-providers", dnsProvidersRoutes);
```

- [ ] **Step 3: Smoke — сервер поднимается, роут отвечает 401 без токена**

Run: `cd backend && node -e "import('./routes/main.js').then(()=>console.log('routes load OK'))"`
Expected: `routes load OK`.

- [ ] **Step 4: Lint + commit**

```bash
cd backend && yarn lint routes/nginx/dns_providers.js routes/main.js
git add backend/routes/nginx/dns_providers.js backend/routes/main.js
git commit -m "feat(backend): add dns-providers REST routes"
```

---

## Phase 6 — Wire into proxy-host lifecycle

### Task 13: Хуки sync/cleanup + `dns_provider_id` в схеме proxy-host

**Files:**
- Modify: `backend/internal/proxy-host.js`
- Modify: `backend/schema/paths/nginx/proxy-hosts/post.json`
- Modify: `backend/schema/paths/nginx/proxy-hosts/hostID/put.json`

**Interfaces:**
- Consumes: `internalDnsRecord.sync`/`cleanup` (Task 9).
- Produces: proxy-host create/update пишут `meta.dns_synced/dns_err/dns_records`; delete чистит записи. Поле `dns_provider_id` принимается в POST/PUT.

- [ ] **Step 1: Импорт в `internal/proxy-host.js`**

Рядом с другими `internal`-импортами:
```js
import internalDnsRecord from "./dns-record.js";
```

- [ ] **Step 2: Хук в `create` — после `internalNginx.configure`**

В `create`, в `.then((row) => { ... internalNginx.configure(...) ... })` (около строки 86–90) после успешной конфигурации nginx добавить синхронизацию DNS и запись статуса в meta:
```js
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(proxyHostModel, "proxy_host", row).then(() => row);
			})
			.then(async (row) => {
				// Sync DNS records (never blocks host creation)
				const dnsMeta = await internalDnsRecord.sync(row);
				await proxyHostModel
					.query()
					.where("id", row.id)
					.patch({ meta: _.assign({}, row.meta, dnsMeta) });
				row.meta = _.assign({}, row.meta, dnsMeta);
				return row;
			})
```
(Встроить, сохранив последующий `.then` с audit-log.)

- [ ] **Step 3: Хук в `update` — после configure**

В `update`, где после `internalNginx.configure(...).then((new_meta) => { row.meta = new_meta; ... })` (около строки 217) добавить sync с диффом:
```js
						return internalNginx.configure(proxyHostModel, "proxy_host", row).then(async (new_meta) => {
							row.meta = new_meta;
							const dnsMeta = await internalDnsRecord.sync(row);
							await proxyHostModel
								.query()
								.where("id", row.id)
								.patch({ meta: _.assign({}, row.meta, dnsMeta) });
							row.meta = _.assign({}, row.meta, dnsMeta);
							return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
						});
```
> Если при update меняется `dns_provider_id`, `row` уже содержит новое значение и старые `meta.dns_records`; `sync` корректно удалит записи, которых больше нет, и создаст недостающие. Смена самого провайдера на другой аккаунт — вне текущего scope (документировано в спеке как ограничение); при необходимости обрабатывается отдельной задачей.

- [ ] **Step 4: Хук в `delete` — перед/после удаления nginx-конфига**

В `delete` (около строки 293), внутри цепочки после получения `row` и до финального `return true`, добавить:
```js
					.then(() => {
						// Remove DNS records (never blocks host deletion)
						return internalDnsRecord.cleanup(row);
					})
```
Разместить после блока audit-log `.then(...)`.

- [ ] **Step 5: Разрешить `dns_provider_id` в схемах**

В `backend/schema/paths/nginx/proxy-hosts/post.json` и `.../hostID/put.json` в `properties` добавить:
```json
"dns_provider_id": { "type": "integer", "minimum": 0 }
```

- [ ] **Step 6: Валидировать схему + lint**

Run: `cd backend && yarn validate-schema && yarn lint internal/proxy-host.js`
Expected: без ошибок.

- [ ] **Step 7: Прогнать все backend-юниты**

Run: `cd backend && yarn test`
Expected: PASS (selectel + dns-record сьюты).

- [ ] **Step 8: Commit**

```bash
git add backend/internal/proxy-host.js backend/schema/paths/nginx/proxy-hosts/post.json backend/schema/paths/nginx/proxy-hosts/hostID/put.json
git commit -m "feat(backend): sync DNS records on proxy-host create/update/delete"
```

---

## Phase 7 — Frontend API layer

### Task 14: API-клиент DNS Provider + типы

**Files:**
- Create: `frontend/src/api/backend/{getDnsProviders,getDnsProvider,createDnsProvider,updateDnsProvider,deleteDnsProvider,testDnsProvider}.ts`
- Modify: `frontend/src/api/backend/models.ts`, `expansions.ts`, `index.ts`

**Interfaces:**
- Produces: типы `DnsProvider`, `DnsProviderCredentials`; функции CRUD + `testDnsProvider(id) → Promise<{ok:boolean; error?:string}>`.

- [ ] **Step 1: Тип в `models.ts`**

Добавить (согласовать стиль с существующими интерфейсами файла):
```ts
export interface DnsProviderCredentials {
	accountId: string;
	projectName: string;
	username: string;
	password: string;
}

export interface DnsProvider {
	id?: number;
	name: string;
	type: "selectel";
	credentials?: DnsProviderCredentials;
	defaultIp: string;
	ttl?: number;
	meta?: Record<string, unknown>;
}
```

- [ ] **Step 2: Файлы CRUD (по образцу `getAccessLists.ts`/`createAccessList.ts`)**

`getDnsProviders.ts`:
```ts
import * as api from "./base";
import type { DnsProvider } from "./models";

export async function getDnsProviders(expand?: string[], params = {}): Promise<DnsProvider[]> {
	return await api.get({ url: "/nginx/dns-providers", params: { expand: expand?.join(","), ...params } });
}
```
`getDnsProvider.ts`:
```ts
import * as api from "./base";
import type { DnsProvider } from "./models";

export async function getDnsProvider(id: number, expand?: string[]): Promise<DnsProvider> {
	return await api.get({ url: `/nginx/dns-providers/${id}`, params: { expand: expand?.join(",") } });
}
```
`createDnsProvider.ts`:
```ts
import * as api from "./base";
import type { DnsProvider } from "./models";

export async function createDnsProvider(item: DnsProvider): Promise<DnsProvider> {
	return await api.post({ url: "/nginx/dns-providers", data: item });
}
```
`updateDnsProvider.ts`:
```ts
import * as api from "./base";
import type { DnsProvider } from "./models";

export async function updateDnsProvider(id: number, item: Partial<DnsProvider>): Promise<DnsProvider> {
	return await api.put({ url: `/nginx/dns-providers/${id}`, data: item });
}
```
`deleteDnsProvider.ts`:
```ts
import * as api from "./base";

export async function deleteDnsProvider(id: number): Promise<boolean> {
	return await api.del({ url: `/nginx/dns-providers/${id}` });
}
```
`testDnsProvider.ts`:
```ts
import * as api from "./base";

export async function testDnsProvider(id: number): Promise<{ ok: boolean; error?: string }> {
	return await api.get({ url: `/nginx/dns-providers/${id}/test` });
}
```
> Проверить фактические имена методов в `base.ts` (`get`/`post`/`put`/`del` или `delete`) и привести вызовы в соответствие.

- [ ] **Step 3: Реэкспорт в `index.ts`**

Добавить экспорты новых функций по образцу существующих строк `export * from "./getAccessLists";` и т.п.

- [ ] **Step 4: Тип-чек**

Run: `cd frontend && yarn build`
Expected: `tsc` без ошибок, сборка проходит.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/backend
git commit -m "feat(frontend): add dns-provider api client and types"
```

---

## Phase 8 — Frontend DNS Providers UI

### Task 15: Раздел «DNS Providers» (список + модалка)

**Files:**
- Create: `frontend/src/pages/Nginx/DnsProviders/` (index + таблица)
- Create: `frontend/src/modals/DnsProviderModal.tsx`
- Modify: `frontend/src/modals/index.ts`, `frontend/src/Router.tsx`

**Interfaces:**
- Consumes: API-клиент (Task 14).
- Produces: маршрут списка провайдеров; модалка create/edit с полями `name`, `type` (пока только Selectel), `credentials.{accountId,projectName,username,password}`, `defaultIp`, `ttl`, кнопка **Test connection**.

- [ ] **Step 1: Модалка `DnsProviderModal.tsx`**

Скопировать структуру `frontend/src/modals/AccessListModal.tsx` (Formik + Tabler modal + TanStack Query mutations). Поля формы:
- `name` (text, required)
- `type` (select, options: `[{value:"selectel", label:"Selectel"}]`, default `selectel`)
- `credentials.accountId`, `credentials.projectName`, `credentials.username`, `credentials.password` (password-поле; при edit — пустое = «не менять»)
- `defaultIp` (text, required, валидация IPv4)
- `ttl` (number, default 300)
- Кнопка **Test connection** → `testDnsProvider(id)` (активна только для уже сохранённого провайдера), результат показывать через `react-toastify`.
Сабмит: `createDnsProvider` / `updateDnsProvider`, инвалидация query-ключа списка.

- [ ] **Step 2: Страница списка `pages/Nginx/DnsProviders/index.tsx`**

По образцу существующего списка (напр. `pages/Access` или nginx-таблиц на `@tanstack/react-table`): колонки `name`, `type`, `default_ip`, статус последней проверки (`meta`), действия Edit/Delete. Данные — `useQuery(getDnsProviders)`. Кнопка «Add DNS Provider» открывает модалку.

- [ ] **Step 3: Зарегистрировать модалку в `modals/index.ts`** и маршрут/навигацию в `Router.tsx`

Добавить пункт навигации «DNS Providers» в раздел Nginx и `<Route>` на страницу списка, по образцу соседних hosts-роутов.

- [ ] **Step 4: i18n-строки**

Добавить ключи (`dns-providers.title`, `.add`, `.name`, `.type`, `.default-ip`, `.ttl`, `.test`, `.credentials.*`) в `frontend/src/locale/src/en.json`. Прогнать:
Run: `cd frontend && yarn locale-compile && node check-locales.cjs`
Expected: без пропущенных обязательных ключей для базовой локали.

- [ ] **Step 5: Тип-чек/сборка**

Run: `cd frontend && yarn build`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Nginx/DnsProviders frontend/src/modals/DnsProviderModal.tsx frontend/src/modals/index.ts frontend/src/Router.tsx frontend/src/locale/src/en.json
git commit -m "feat(frontend): add DNS Providers list and modal"
```

### Task 16: Поле DNS Provider + индикатор статуса в форме proxy-host

**Files:**
- Modify: `frontend/src/modals/ProxyHostModal.tsx`
- Modify: `frontend/src/api/backend/models.ts` (поле `dnsProviderId` в типе proxy-host)

**Interfaces:**
- Consumes: `getDnsProviders` (Task 14).
- Produces: в форме proxy-host селект «DNS Provider» (опционально, `None`=0) + индикатор `meta.dns_synced/dns_err`.

- [ ] **Step 1: Добавить `dnsProviderId` в тип proxy-host** в `models.ts` (`dnsProviderId?: number;`).

- [ ] **Step 2: Селект в `ProxyHostModal.tsx`**

Добавить поле формы `dns_provider_id` (react-select/Tabler select) с опцией `None` (value 0) + список из `useQuery(getDnsProviders)`. Значение сериализуется в payload как `dns_provider_id`.

- [ ] **Step 3: Индикатор статуса DNS**

В модалке (или в списке proxy-hosts) показать бейдж: `meta.dns_synced === true` → зелёный «DNS synced»; `meta.dns_err` → красный с тултипом текста ошибки; провайдер не задан → скрыт. По образцу индикатора `nginx_online`/`nginx_err`, если он есть в UI; иначе — простой Tabler badge.

- [ ] **Step 4: Сборка**

Run: `cd frontend && yarn build`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modals/ProxyHostModal.tsx frontend/src/api/backend/models.ts
git commit -m "feat(frontend): add DNS provider selector and status to proxy-host form"
```

---

## Phase 9 — End-to-end

### Task 17: Cypress e2e для DNS Providers

**Files:**
- Create: `test/cypress/e2e/DnsProviders.cy.js`

**Interfaces:**
- Consumes: REST API (Tasks 10–13).
- Produces: e2e-покрытие CRUD провайдера + создание proxy-host с провайдером.

- [ ] **Step 1: Написать спеку по образцу `test/cypress/e2e/ProxyHosts.cy.js`**

Сценарии:
1. Создать DNS Provider (Selectel, фиктивные creds, `default_ip`) через API → 201, `credentials` отсутствует в ответе.
2. Список содержит созданного провайдера.
3. `GET /nginx/dns-providers/:id/test` → возвращает `{ok:false, error:...}` при фиктивных creds (Selectel API недоступен/отклонит) — проверяем структуру ответа, не блокировку.
4. Создать proxy-host с `dns_provider_id` → 201, хост создан, `meta.dns_synced === false`, `meta.dns_err` заполнено (реальный Selectel не отвечает в CI) — подтверждает «не блокирует».
5. Удалить провайдера и хост → 200.

> Selectel API в CI недоступен — тесты проверяют graceful-поведение (хост создаётся, ошибка в meta), а не успешный вызов внешнего API. Успешный путь driver'а покрыт backend-юнитами (Task 6).

- [ ] **Step 2: Прогнать e2e против dev-стека**

Run: `./scripts/start-dev && cd test && yarn cypress:dev --spec cypress/e2e/DnsProviders.cy.js`
Expected: все сценарии зелёные.

- [ ] **Step 3: Swagger-lint**

Run: `cd test && yarn swagger-lint`
Expected: без новых ошибок для путей dns-providers.

- [ ] **Step 4: Commit**

```bash
git add test/cypress/e2e/DnsProviders.cy.js
git commit -m "test: add e2e coverage for dns-providers"
```

---

## Self-Review

**Spec coverage:**
- Сущность DNS Provider (таблица/CRUD) → Tasks 2,3,10,11,12,15. ✅
- A-запись на ручной IP → `default_ip` (Task 2), `createRecord` (Task 6). ✅
- Только proxy-host → хуки только в `internal/proxy-host.js` (Task 13). ✅
- Ошибка не блокирует, статус в meta → `sync/cleanup` не бросают (Task 9), хук пишет meta (Task 13). ✅
- CUD, только свои записи → `meta.dns_records` + `diffDomains` (Tasks 8,9). ✅
- Longest-suffix резолв без авто-создания зоны → `resolveZone` + throw при отсутствии (Tasks 5,6). ✅
- Формат credentials как certbot → Task 6 payload, Task 11 schema. ✅
- Keystone auth + кэш токена → Task 6. ✅
- credentials омитируются из ответов → `omissions()` (Task 10), не в object-схеме (Task 11). ✅
- admin-only → Task 4. ✅
- UI провайдеров + селект/статус в хосте → Tasks 15,16. ✅
- Тесты (юнит + e2e) → Tasks 1,5,6,8,9,17. ✅

**Placeholder scan:** Frontend Tasks 15–16 ссылаются на образцы-файлы (AccessListModal, ProxyHostModal) вместо полного копирования 9–12 КБ разметки — это конкретная инструкция с точными полями, не «TBD». Boilerplate-схемы Task 11 описаны как «скопировать X, заменить Y» с явными изменениями.

**Type consistency:** `sync`/`cleanup`/`diffDomains` (dns-record), `createRecord`/`deleteRecord`/`testConnection`/`resolveZone` (selectel), `getDriver`/`SUPPORTED_TYPES` (dispatcher), `dns_records={domain,zone_id,rrset_id}` — имена согласованы между Tasks 5–9,13. Meta-поля `dns_synced/dns_err/dns_records` едины в Tasks 9,13,16,17.

**Открытые риски для исполнителя (проверить на месте):**
- Точный механизм склейки методов в `swagger.json` (get+post в один путь) — Task 11 Step 6.
- Имена методов `base.ts` (`del` vs `delete`) — Task 14.
- Наличие `internalHost.cleanRowCertificateMeta`/`omissions()` в области видимости `update` — Task 13.
- Имя фабрики логгеров в `logger.js` — Task 9 Step 1.
