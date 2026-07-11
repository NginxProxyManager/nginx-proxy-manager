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

const IDENTITY_URL = "https://cloud.api.selcloud.ru/identity/v3/auth/tokens";
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
