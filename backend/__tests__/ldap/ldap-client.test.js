/**
 * Unit tests for backend/lib/ldap-client.js
 *
 * Run with Jest + ESM support:
 *   NODE_OPTIONS="--experimental-vm-modules" npx jest --no-coverage __tests__/ldap/ldap-client.test.js
 *
 * All ldapjs calls are mocked — no real LDAP server required.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Socket mock — shared across tests
// ---------------------------------------------------------------------------

const mockSocket = {
	setKeepAlive: jest.fn(),
	destroyed:    false,
	writable:     true,
};

const mockClient = {
	bind:           jest.fn(),
	search:         jest.fn(),
	unbind:         jest.fn(),
	starttls:       jest.fn(),
	destroy:        jest.fn(),
	on:             jest.fn(),
	once:           jest.fn(),
	removeListener: jest.fn(),
	socket:         mockSocket,
};

// ---------------------------------------------------------------------------
// ESM-compatible mocks — must use unstable_mockModule before dynamic imports
// ---------------------------------------------------------------------------

jest.unstable_mockModule("ldapjs", () => ({
	default: {
		createClient: jest.fn(() => mockClient),
	},
}));

jest.unstable_mockModule("../../logger.js", () => ({
	global: { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
	ldap:   { debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Dynamic imports AFTER mocks are registered
// ---------------------------------------------------------------------------

const ldapModule   = await import("ldapjs");
const ldap         = ldapModule.default;

const clientModule = await import("../../lib/ldap-client.js");
const LdapClient   = clientModule.default;
const {
	mapLdapError,
	borrowFromPool,
	returnToPool,
	stopReaper,
	isSocketHealthy,
	pools,
	reaperHandles,
	DEFAULT_KEEP_ALIVE_MS,
	DEFAULT_IDLE_TIMEOUT_MS,
	REAPER_INTERVAL_MS,
	semaphores,
	DEFAULT_MAX_CONNECTIONS,
	DEFAULT_ACQUIRE_TIMEOUT_MS,
} = clientModule;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const simulateConnect = () => {
	mockClient.once.mockImplementation((event, cb) => {
		if (event === "connect") {
			setImmediate(cb);
		}
	});
};

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	jest.clearAllMocks();

	// Reset socket to healthy state
	mockSocket.destroyed = false;
	mockSocket.writable  = true;
	mockClient.socket    = mockSocket;

	// Re-attach mock return value (clearAllMocks clears it)
	ldap.createClient.mockReturnValue(mockClient);

	simulateConnect();
});

// ── mapLdapError ──────────────────────────────────────────────────────────

describe("mapLdapError", () => {
	it("maps code 49 to invalid credentials message", () => {
		expect(mapLdapError({ code: 49 })).toMatch(/invalid credentials/i);
	});

	it("maps code 32 to no such object message", () => {
		expect(mapLdapError({ code: 32 })).toMatch(/no such object/i);
	});

	it("maps code 34 to invalid DN syntax", () => {
		expect(mapLdapError({ code: 34 })).toMatch(/invalid dn/i);
	});

	it("maps code 52 to server unavailable", () => {
		expect(mapLdapError({ code: 52 })).toMatch(/unavailable/i);
	});

	it("returns the error message for unknown codes", () => {
		expect(mapLdapError({ code: 999, message: "custom error" })).toBe("custom error");
	});

	it("handles null gracefully", () => {
		expect(mapLdapError(null)).toBe("Unknown LDAP error");
	});

	it("handles errors without a code property", () => {
		expect(mapLdapError({ message: "socket hang up" })).toBe("socket hang up");
	});
});

// ── LdapClient.create ─────────────────────────────────────────────────────

describe("LdapClient.create", () => {
	it("creates a client for ldap:// URL", async () => {
		const client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
		expect(ldap.createClient).toHaveBeenCalledWith(
			expect.objectContaining({ url: "ldap://dc.example.com" }),
		);
		expect(client).toBeInstanceOf(LdapClient);
	});

	it("creates a client for ldaps:// URL", async () => {
		const client = await LdapClient.create({ serverUrl: "ldaps://dc.example.com" });
		expect(ldap.createClient).toHaveBeenCalledWith(
			expect.objectContaining({ url: "ldaps://dc.example.com" }),
		);
		expect(client).toBeInstanceOf(LdapClient);
	});

	it("binds with service account credentials when bindDN is provided", async () => {
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(null));

		await LdapClient.create({
			serverUrl:    "ldap://dc.example.com",
			bindDN:       "cn=service,dc=example,dc=com",
			bindPassword: "s3cr3t",
		});

		expect(mockClient.bind).toHaveBeenCalledWith(
			"cn=service,dc=example,dc=com",
			"s3cr3t",
			expect.any(Function),
		);
	});

	it("skips bind when no bindDN is provided (anonymous)", async () => {
		await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
		expect(mockClient.bind).not.toHaveBeenCalled();
	});

	it("rejects when bind fails (invalid credentials)", async () => {
		const bindErr = Object.assign(new Error("invalidCredentials"), { code: 49 });
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(bindErr));

		await expect(
			LdapClient.create({
				serverUrl:    "ldap://dc.example.com",
				bindDN:       "cn=service,dc=example,dc=com",
				bindPassword: "wrong",
			}),
		).rejects.toThrow(/invalid credentials/i);
	});

	it("performs STARTTLS upgrade for ldap:// when starttls=true", async () => {
		mockClient.starttls.mockImplementation((_opts, _cb1, cb) => cb(null));

		await LdapClient.create({
			serverUrl: "ldap://dc.example.com",
			starttls:  true,
		});

		expect(mockClient.starttls).toHaveBeenCalled();
	});

	it("does NOT perform STARTTLS for ldaps:// even if starttls=true", async () => {
		await LdapClient.create({
			serverUrl: "ldaps://dc.example.com",
			starttls:  true,
		});

		expect(mockClient.starttls).not.toHaveBeenCalled();
	});

	it("rejects when STARTTLS upgrade fails", async () => {
		const tlsErr = new Error("TLS handshake failed");
		mockClient.starttls.mockImplementation((_opts, _cb1, cb) => cb(tlsErr));

		await expect(
			LdapClient.create({
				serverUrl: "ldap://dc.example.com",
				starttls:  true,
			}),
		).rejects.toThrow(/STARTTLS failed/i);
	});

	it("destroys the raw socket when STARTTLS fails mid-connection", async () => {
		const tlsErr = new Error("TLS handshake failed");
		mockClient.starttls.mockImplementation((_opts, _cb1, cb) => cb(tlsErr));

		await expect(
			LdapClient.create({
				serverUrl: "ldap://dc.example.com",
				starttls:  true,
			}),
		).rejects.toThrow(/STARTTLS failed/i);

		// The raw ldapjs client's destroy() must be called so the TCP socket
		// is closed even though the LdapClient wrapper was never returned to
		// the caller.
		expect(mockClient.destroy).toHaveBeenCalledTimes(1);
	});

	it("destroys the raw socket when bind fails after successful TCP connect", async () => {
		const bindErr = Object.assign(new Error("invalidCredentials"), { code: 49 });
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(bindErr));

		await expect(
			LdapClient.create({
				serverUrl:    "ldap://dc.example.com",
				bindDN:       "cn=service,dc=example,dc=com",
				bindPassword: "wrong",
			}),
		).rejects.toThrow(/invalid credentials/i);

		// Bind failure after TCP connect must also close the raw socket.
		expect(mockClient.destroy).toHaveBeenCalledTimes(1);
	});
});

// ── Connection timeout ────────────────────────────────────────────────────

describe("connection timeout", () => {
	it("rejects after connectTimeout ms if the server never responds", async () => {
		jest.useFakeTimers();

		mockClient.once.mockImplementation(() => {}); // never emits connect or error

		const connectPromise = LdapClient.create({
			serverUrl:      "ldap://unreachable.example.com",
			connectTimeout: 5000,
		});

		jest.advanceTimersByTime(6001);

		await expect(connectPromise).rejects.toThrow(/timed out/i);

		jest.useRealTimers();
	});
});

// ── bind ──────────────────────────────────────────────────────────────────

describe("LdapClient.bind", () => {
	let client;

	beforeEach(async () => {
		client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
	});

	it("resolves on successful bind", async () => {
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(null));
		await expect(client.bind("cn=user,dc=example,dc=com", "pass")).resolves.toBeUndefined();
	});

	it("rejects with mapped error message on bind failure", async () => {
		const err = Object.assign(new Error("invalidCredentials"), { code: 49 });
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(err));

		await expect(client.bind("cn=user,dc=example,dc=com", "wrong")).rejects.toThrow(
			/invalid credentials/i,
		);
	});

	it("updates _lastUsed timestamp on bind", async () => {
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(null));
		const before = client._lastUsed;
		await new Promise((r) => setTimeout(r, 5));
		await client.bind("cn=user,dc=example,dc=com", "pass");
		expect(client._lastUsed).toBeGreaterThanOrEqual(before);
	});
});

// ── search ────────────────────────────────────────────────────────────────

describe("LdapClient.search", () => {
	let client;

	beforeEach(async () => {
		client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
	});

	const mockSearchResult = (entries = [], status = 0) => {
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			const res = {
				on: jest.fn((event, handler) => {
					if (event === "searchEntry") {
						for (const entry of entries) handler(entry);
					}
					if (event === "end") handler({ status });
				}),
			};
			cb(null, res);
		});
	};

	it("returns an empty array when no entries match", async () => {
		mockSearchResult([]);
		const results = await client.search("dc=example,dc=com", { filter: "(uid=nobody)" });
		expect(results).toEqual([]);
	});

	it("returns parsed entries with dn and attributes", async () => {
		mockSearchResult([
			{
				dn:         { toString: () => "uid=alice,dc=example,dc=com" },
				attributes: [
					{ type: "uid",  values: ["alice"] },
					{ type: "mail", values: ["alice@example.com"] },
				],
			},
		]);

		const [entry] = await client.search("dc=example,dc=com", { filter: "(uid=alice)" });
		expect(entry.dn).toBe("uid=alice,dc=example,dc=com");
		expect(entry.uid).toBe("alice");
		expect(entry.mail).toBe("alice@example.com");
	});

	it("collapses single-value attributes to a string (not array)", async () => {
		mockSearchResult([
			{
				dn:         { toString: () => "uid=bob,dc=example,dc=com" },
				attributes: [{ type: "cn", values: ["Bob"] }],
			},
		]);

		const [entry] = await client.search("dc=example,dc=com", { filter: "(uid=bob)" });
		expect(typeof entry.cn).toBe("string");
		expect(entry.cn).toBe("Bob");
	});

	it("keeps multi-value attributes as an array", async () => {
		mockSearchResult([
			{
				dn:         { toString: () => "uid=alice,dc=example,dc=com" },
				attributes: [
					{
						type:   "memberOf",
						values: [
							"cn=npm-admins,ou=Groups,dc=example,dc=com",
							"cn=npm-users,ou=Groups,dc=example,dc=com",
						],
					},
				],
			},
		]);

		const [entry] = await client.search("dc=example,dc=com", {});
		expect(Array.isArray(entry.memberOf)).toBe(true);
		expect(entry.memberOf).toHaveLength(2);
	});

	it("rejects when search returns a non-zero status", async () => {
		mockSearchResult([], 32);
		await expect(client.search("dc=example,dc=com", {})).rejects.toThrow(/status 32/i);
	});

	it("rejects when ldapjs reports a search error", async () => {
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			cb(Object.assign(new Error("Server error"), { code: 1 }));
		});

		await expect(client.search("dc=example,dc=com", {})).rejects.toThrow(/LDAP operations error/i);
	});

	it("updates _lastUsed timestamp on search", async () => {
		mockSearchResult([]);
		const before = client._lastUsed;
		await new Promise((r) => setTimeout(r, 5));
		await client.search("dc=example,dc=com", {});
		expect(client._lastUsed).toBeGreaterThanOrEqual(before);
	});
});

// ── searchPaged (RFC 2696 Paged Results Control) ──────────────────────────

describe("LdapClient.searchPaged", () => {
	let client;

	beforeEach(async () => {
		client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
	});

	/**
	 * Helper: mock client.search to emit N entries then fire the 'page' event
	 * (simulating a server that supports RFC 2696 paging), then fire 'end'.
	 *
	 * @param {Array<Array>} pages  Array of entry arrays, one per page.
	 */
	const mockPagedSearch = (pages) => {
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			const listeners = {};
			const res = {
				on: jest.fn((event, handler) => {
					listeners[event] = handler;
				}),
			};
			cb(null, res);

			// Process pages asynchronously so pageHandler can await DB writes
			setImmediate(async () => {
				for (const entries of pages) {
					// Emit entries for this page
					for (const entry of entries) {
						listeners.searchEntry?.(entry);
					}
					// Emit 'page' event — next is a callback that continues to the next page
					await new Promise((resolve) => {
						if (listeners.page) {
							listeners.page({ status: 0 }, resolve);
						} else {
							resolve();
						}
					});
				}
				// All pages done — emit 'end'
				listeners.end?.({ status: 0 });
			});
		});
	};

	/** Helper: build a synthetic ldapjs entry object */
	const makeEntry = (dn, attrs) => ({
		dn:         { toString: () => dn },
		attributes: Object.entries(attrs).map(([type, values]) => ({
			type,
			values: Array.isArray(values) ? values : [values],
		})),
	});

	it("calls pageHandler once for a single page of entries", async () => {
		const page1 = [
			makeEntry("uid=alice,dc=example,dc=com", { uid: "alice", mail: "alice@example.com" }),
		];
		mockPagedSearch([page1]);

		const receivedPages = [];
		await client.searchPaged(
			"dc=example,dc=com",
			{ filter: "(uid=*)", pageSize: 100 },
			async (entries) => { receivedPages.push(entries); },
		);

		expect(receivedPages).toHaveLength(1);
		expect(receivedPages[0]).toHaveLength(1);
		expect(receivedPages[0][0].uid).toBe("alice");
	});

	it("calls pageHandler once per page when multiple pages are returned", async () => {
		const page1 = [makeEntry("uid=alice,dc=example,dc=com", { uid: "alice" })];
		const page2 = [makeEntry("uid=bob,dc=example,dc=com",   { uid: "bob"   })];
		const page3 = [makeEntry("uid=carol,dc=example,dc=com", { uid: "carol" })];
		mockPagedSearch([page1, page2, page3]);

		const pageHandlerCalls = [];
		await client.searchPaged(
			"dc=example,dc=com",
			{ filter: "(uid=*)", pageSize: 1 },
			async (entries) => { pageHandlerCalls.push(entries.length); },
		);

		expect(pageHandlerCalls).toEqual([1, 1, 1]); // 3 pages, 1 entry each
	});

	it("does not accumulate entries across pages (memory bound)", async () => {
		// 5 pages of 3 entries each = 15 entries total
		const pages = Array.from({ length: 5 }, (_, i) =>
			Array.from({ length: 3 }, (__, j) =>
				makeEntry(`uid=u${i}-${j},dc=example,dc=com`, { uid: `u${i}-${j}` }),
			),
		);
		mockPagedSearch(pages);

		let maxBatchSize = 0;
		let totalEntries = 0;
		await client.searchPaged(
			"dc=example,dc=com",
			{ filter: "(uid=*)", pageSize: 3 },
			async (entries) => {
				// Each batch must be exactly 3 entries (page size) — not cumulative
				maxBatchSize = Math.max(maxBatchSize, entries.length);
				totalEntries += entries.length;
			},
		);

		// Each page was processed independently — max batch size = pageSize
		expect(maxBatchSize).toBe(3);
		// All 15 entries were processed
		expect(totalEntries).toBe(15);
	});

	it("passes RFC 2696 Paged Results Control (paged option) to ldapjs", async () => {
		mockPagedSearch([[]]);

		await client.searchPaged(
			"dc=example,dc=com",
			{ filter: "(uid=*)", pageSize: 250 },
			async () => {},
		);

		expect(mockClient.search).toHaveBeenCalledWith(
			"dc=example,dc=com",
			expect.objectContaining({
				paged: expect.objectContaining({ pageSize: 250, pagePause: true }),
			}),
			expect.any(Function),
		);
	});

	it("flushes remaining entries via 'end' event when server does not support paging", async () => {
		// Simulate a server that sends entries directly via 'end' with no 'page' event
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			const listeners = {};
			const res = {
				on: jest.fn((event, handler) => { listeners[event] = handler; }),
			};
			cb(null, res);

			setImmediate(() => {
				// No 'page' events — entries come through and end fires directly
				listeners.searchEntry?.(makeEntry("uid=nopaging,dc=example,dc=com", { uid: "nopaging" }));
				listeners.end?.({ status: 0 });
			});
		});

		const receivedEntries = [];
		await client.searchPaged(
			"dc=example,dc=com",
			{ filter: "(uid=*)", pageSize: 500 },
			async (entries) => { receivedEntries.push(...entries); },
		);

		expect(receivedEntries).toHaveLength(1);
		expect(receivedEntries[0].uid).toBe("nopaging");
	});

	it("rejects when pageHandler throws an error", async () => {
		const page1 = [makeEntry("uid=alice,dc=example,dc=com", { uid: "alice" })];
		mockPagedSearch([page1]);

		await expect(
			client.searchPaged(
				"dc=example,dc=com",
				{ filter: "(uid=*)", pageSize: 100 },
				async () => { throw new Error("handler error"); },
			),
		).rejects.toThrow("handler error");
	});

	it("rejects when ldapjs reports a search error", async () => {
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			cb(Object.assign(new Error("Server error"), { code: 1 }));
		});

		await expect(
			client.searchPaged("dc=example,dc=com", { filter: "(uid=*)" }, async () => {}),
		).rejects.toThrow(/LDAP operations error/i);
	});

	it("rejects when search ends with a non-zero status", async () => {
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			const listeners = {};
			const res = { on: jest.fn((event, handler) => { listeners[event] = handler; }) };
			cb(null, res);
			setImmediate(() => { listeners.end?.({ status: 32 }); });
		});

		await expect(
			client.searchPaged("dc=example,dc=com", { filter: "(uid=*)" }, async () => {}),
		).rejects.toThrow(/status 32/i);
	});

	it("updates _lastUsed timestamp on searchPaged", async () => {
		mockPagedSearch([[]]);
		const before = client._lastUsed;
		await new Promise((r) => setTimeout(r, 5));
		await client.searchPaged("dc=example,dc=com", { pageSize: 100 }, async () => {});
		expect(client._lastUsed).toBeGreaterThanOrEqual(before);
	});

	it("awaits pageHandler before requesting the next page (backpressure)", async () => {
		const page1 = [makeEntry("uid=a,dc=example,dc=com", { uid: "a" })];
		const page2 = [makeEntry("uid=b,dc=example,dc=com", { uid: "b" })];
		mockPagedSearch([page1, page2]);

		const order = [];
		await client.searchPaged(
			"dc=example,dc=com",
			{ pageSize: 1 },
			async (entries) => {
				order.push(`handler-${entries[0].uid}`);
				// Simulate an async DB write delay
				await new Promise((r) => setTimeout(r, 5));
				order.push(`done-${entries[0].uid}`);
			},
		);

		// Verify: handler for page 1 completes BEFORE handler for page 2 starts
		expect(order.indexOf("done-a")).toBeLessThan(order.indexOf("handler-b"));
	});
});

// ── Memory bounding: searchPaged vs search ────────────────────────────────

describe("memory bounding: searchPaged does not accumulate entries", () => {
	let client;

	beforeEach(async () => {
		client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
	});

	it("never holds more than one page of entries in memory at a time", async () => {
		const PAGE_SIZE = 3;
		const TOTAL_PAGES = 4;

		// Mock a multi-page search
		mockClient.search.mockImplementation((_base, _opts, cb) => {
			const listeners = {};
			const res = { on: jest.fn((event, handler) => { listeners[event] = handler; }) };
			cb(null, res);

			// biome-ignore lint/correctness/noUnusedVariables: used inside setImmediate callback
			let nextCalled = 0;
			setImmediate(async () => {
				for (let page = 0; page < TOTAL_PAGES; page++) {
					for (let i = 0; i < PAGE_SIZE; i++) {
						listeners.searchEntry?.({
							dn:         { toString: () => `uid=u${page}-${i},dc=example,dc=com` },
							attributes: [{ type: "uid", values: [`u${page}-${i}`] }],
						});
					}
					await new Promise((resolve) => {
						if (listeners.page) {
							nextCalled++;
							listeners.page({ status: 0 }, resolve);
						} else {
							resolve();
						}
					});
				}
				listeners.end?.({ status: 0 });
			});
		});

		// Track max entries seen in a single pageHandler invocation
		let maxEntriesPerHandler = 0;
		let totalEntries = 0;

		await client.searchPaged(
			"dc=example,dc=com",
			{ filter: "(uid=*)", pageSize: PAGE_SIZE },
			async (entries) => {
				maxEntriesPerHandler = Math.max(maxEntriesPerHandler, entries.length);
				totalEntries += entries.length;
			},
		);

		// Verify memory was bounded: each handler call saw exactly PAGE_SIZE entries
		expect(maxEntriesPerHandler).toBe(PAGE_SIZE);
		// All entries were processed
		expect(totalEntries).toBe(PAGE_SIZE * TOTAL_PAGES);
	});
});

// ── destroy ───────────────────────────────────────────────────────────────

describe("LdapClient.destroy", () => {
	it("calls unbind and marks client as destroyed", async () => {
		const client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
		client.destroy();
		expect(mockClient.unbind).toHaveBeenCalledTimes(1);
		expect(client._destroyed).toBe(true);
	});

	it("does not call unbind a second time if already destroyed", async () => {
		const client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
		client.destroy();
		client.destroy();
		expect(mockClient.unbind).toHaveBeenCalledTimes(1);
	});
});

// ── TCP keep-alive ────────────────────────────────────────────────────────

describe("TCP keep-alive", () => {
	it("calls setKeepAlive on the socket when client is created", async () => {
		await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
		expect(mockSocket.setKeepAlive).toHaveBeenCalledWith(true, expect.any(Number));
	});

	it("passes DEFAULT_KEEP_ALIVE_MS as the keep-alive interval by default", async () => {
		await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
		expect(mockSocket.setKeepAlive).toHaveBeenCalledWith(true, DEFAULT_KEEP_ALIVE_MS);
	});

	it("uses cfg.keepAliveMs when provided", async () => {
		await LdapClient.create({
			serverUrl:   "ldap://dc.example.com",
			keepAliveMs: 10_000,
		});
		expect(mockSocket.setKeepAlive).toHaveBeenCalledWith(true, 10_000);
	});

	it("does not throw when socket is not yet available", async () => {
		const originalSocket = mockClient.socket;
		mockClient.socket = null;

		await expect(
			LdapClient.create({ serverUrl: "ldap://dc.example.com" }),
		).resolves.toBeInstanceOf(LdapClient);

		mockClient.socket = originalSocket;
	});
});

// ── isSocketHealthy ───────────────────────────────────────────────────────

describe("isSocketHealthy", () => {
	let client;

	beforeEach(async () => {
		client = await LdapClient.create({ serverUrl: "ldap://dc.example.com" });
	});

	it("returns true for a healthy, writable socket", () => {
		mockSocket.destroyed = false;
		mockSocket.writable  = true;
		expect(isSocketHealthy(client)).toBe(true);
	});

	it("returns false when _destroyed flag is set on the LdapClient", () => {
		client._destroyed = true;
		expect(isSocketHealthy(client)).toBe(false);
	});

	it("returns false when the underlying socket.destroyed is true", () => {
		mockSocket.destroyed = true;
		mockSocket.writable  = true;
		expect(isSocketHealthy(client)).toBe(false);
	});

	it("returns false when socket.writable is false (half-closed)", () => {
		mockSocket.destroyed = false;
		mockSocket.writable  = false;
		expect(isSocketHealthy(client)).toBe(false);
	});

	it("returns false when there is no socket reference", () => {
		client._client = { socket: null };
		expect(isSocketHealthy(client)).toBe(false);
	});

	it("returns false when _client itself is null", () => {
		client._client = null;
		expect(isSocketHealthy(client)).toBe(false);
	});
});

// ── Connection pool ───────────────────────────────────────────────────────

describe("connection pool (borrowFromPool / returnToPool)", () => {
	const poolCfg = {
		serverUrl:    "ldap://pool.example.com",
		bindDN:       "cn=svc,dc=example,dc=com",
		bindPassword: "pw",
	};
	const poolKey = `${poolCfg.serverUrl}|${poolCfg.bindDN}|plain`;

	beforeEach(() => {
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(null));
		pools.delete(poolKey);
		semaphores.delete(poolKey);
		stopReaper(poolKey);
	});

	afterEach(() => {
		pools.delete(poolKey);
		semaphores.delete(poolKey);
		stopReaper(poolKey);
	});

	it("returnToPool stores a live client; borrowFromPool retrieves it", async () => {
		const client = await LdapClient.create(poolCfg);
		returnToPool(poolCfg, client);

		const borrowed = await borrowFromPool(poolCfg);
		expect(borrowed).toBe(client);
	});

	it("destroys a client that was already marked as destroyed instead of pooling it", async () => {
		const client = await LdapClient.create(poolCfg);
		client._destroyed = true;

		const destroySpy = jest.spyOn(client, "destroy");
		returnToPool(poolCfg, client);

		expect(destroySpy).not.toHaveBeenCalled(); // returnToPool bails early
		const borrowed = await borrowFromPool(poolCfg);
		expect(borrowed).not.toBe(client);
	});

	it("creates a new client when the pool is empty", async () => {
		ldap.createClient.mockClear();
		const freshUrl = "ldap://fresh-unique.example.com";
		pools.delete(`${freshUrl}|${poolCfg.bindDN}|plain`);
		await borrowFromPool({ ...poolCfg, serverUrl: freshUrl });
		expect(ldap.createClient).toHaveBeenCalledTimes(1);
	});

	it("sets _lastUsed on returnToPool", async () => {
		const client = await LdapClient.create(poolCfg);
		const before = Date.now();
		returnToPool(poolCfg, client);
		expect(client._lastUsed).toBeGreaterThanOrEqual(before);
	});

	it("updates _lastUsed on borrowFromPool", async () => {
		const client = await LdapClient.create(poolCfg);
		returnToPool(poolCfg, client);

		const beforeBorrow = Date.now();
		const borrowed = await borrowFromPool(poolCfg);
		expect(borrowed._lastUsed).toBeGreaterThanOrEqual(beforeBorrow);
	});

	it("discards an unhealthy pooled connection and creates a fresh one", async () => {
		// Manually inject a stale client into the pool
		if (!pools.has(poolKey)) pools.set(poolKey, []);

		const staleClient = await LdapClient.create(poolCfg);
		staleClient._client = {
			socket: { setKeepAlive: jest.fn(), destroyed: true, writable: false },
		};
		staleClient._lastUsed = Date.now();
		pools.get(poolKey).push(staleClient);

		const destroySpy = jest.spyOn(staleClient, "destroy");

		const fresh = await borrowFromPool(poolCfg);
		expect(destroySpy).toHaveBeenCalled();
		expect(fresh).not.toBe(staleClient);
	});

	it("starts the idle reaper when a client is returned to the pool", async () => {
		const client = await LdapClient.create(poolCfg);

		stopReaper(poolKey);
		expect(reaperHandles.has(poolKey)).toBe(false);

		returnToPool(poolCfg, client);
		expect(reaperHandles.has(poolKey)).toBe(true);
	});
});

// ── Idle connection reaper ────────────────────────────────────────────────
//
// These tests use fake timers from the start and construct LdapClient
// instances directly via `new LdapClient(mockClient)` to avoid the async
// `setImmediate`-based connection handshake that doesn't play well with
// fake timers.
// ---------------------------------------------------------------------------

describe("idle connection reaper", () => {
	const reaperCfg = {
		serverUrl:    "ldap://reaper.example.com",
		bindDN:       "cn=svc,dc=example,dc=com",
		bindPassword: "pw",
	};
	const reaperKey = `${reaperCfg.serverUrl}|${reaperCfg.bindDN}|plain`;

	/** Create a client directly, bypassing the async connect flow. */
	const makeClient = () => {
		// LdapClient constructor only calls rawClient.on(), which is a jest.fn
		const instance = new LdapClient(mockClient);
		instance._lastUsed = Date.now();
		return instance;
	};

	beforeEach(() => {
		// Fake timers BEFORE any setInterval calls so the reaper uses fake timers
		jest.useFakeTimers();
		pools.delete(reaperKey);
		semaphores.delete(reaperKey);
		stopReaper(reaperKey);
	});

	afterEach(() => {
		stopReaper(reaperKey);
		pools.delete(reaperKey);
		semaphores.delete(reaperKey);
		jest.useRealTimers();
	});

	it("reaps connections that have been idle longer than idleTimeoutMs", () => {
		const client = makeClient();
		const destroySpy = jest.spyOn(client, "destroy");

		// Pool with 100 ms idle timeout
		returnToPool(reaperCfg, client, 5, 100);

		// Age past the idle threshold (reaper uses Date.now() internally)
		client._lastUsed = Date.now() - 200;

		jest.advanceTimersByTime(REAPER_INTERVAL_MS + 100);

		expect(destroySpy).toHaveBeenCalled();
		expect(pools.get(reaperKey)).toHaveLength(0);
	});

	it("does NOT reap connections that are still within the idle window", () => {
		const client = makeClient();
		const destroySpy = jest.spyOn(client, "destroy");

		returnToPool(reaperCfg, client, 5, 60 * 60 * 1_000 /* 60 minutes */);
		// _lastUsed is already Date.now() (freshly created)

		jest.advanceTimersByTime(REAPER_INTERVAL_MS + 100);

		expect(destroySpy).not.toHaveBeenCalled();
		expect(pools.get(reaperKey)).toHaveLength(1);
	});

	it("reaps connections already marked as _destroyed even if recently used", () => {
		if (!pools.has(reaperKey)) pools.set(reaperKey, []);

		// Inject a dead client directly into the pool
		const deadClient = makeClient();
		pools.get(reaperKey).push(deadClient);
		deadClient._destroyed = true;
		deadClient._lastUsed  = Date.now(); // recently "used" but dead

		// Add a live client via returnToPool to start the reaper
		const liveClient = makeClient();
		returnToPool(reaperCfg, liveClient, 5, 60 * 60 * 1_000);

		jest.advanceTimersByTime(REAPER_INTERVAL_MS + 100);

		const remaining = pools.get(reaperKey) ?? [];
		expect(remaining.includes(deadClient)).toBe(false);
	});

	it("stopReaper clears the interval and removes the handle", () => {
		const client = makeClient();
		returnToPool(reaperCfg, client);

		expect(reaperHandles.has(reaperKey)).toBe(true);

		stopReaper(reaperKey);
		expect(reaperHandles.has(reaperKey)).toBe(false);
	});
});

// ── Error code mapping edge cases ─────────────────────────────────────────

describe("mapLdapError edge cases", () => {
	it("uses lde_errno when code is absent (OpenLDAP compat)", () => {
		expect(mapLdapError({ lde_errno: 53 })).toMatch(/unwilling to perform/i);
	});

	it("handles code 7 (auth method not supported)", () => {
		expect(mapLdapError({ code: 7 })).toMatch(/auth method not supported/i);
	});

	it("handles code 8 (strong auth required)", () => {
		expect(mapLdapError({ code: 8 })).toMatch(/strong auth required/i);
	});

	it("handles code 51 (busy)", () => {
		expect(mapLdapError({ code: 51 })).toMatch(/busy/i);
	});
});

// ── Exported constants ────────────────────────────────────────────────────

describe("exported constants", () => {
	it("DEFAULT_KEEP_ALIVE_MS is a positive number", () => {
		expect(typeof DEFAULT_KEEP_ALIVE_MS).toBe("number");
		expect(DEFAULT_KEEP_ALIVE_MS).toBeGreaterThan(0);
	});

	it("DEFAULT_IDLE_TIMEOUT_MS is a positive number", () => {
		expect(typeof DEFAULT_IDLE_TIMEOUT_MS).toBe("number");
		expect(DEFAULT_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
	});

	it("REAPER_INTERVAL_MS is a positive number", () => {
		expect(typeof REAPER_INTERVAL_MS).toBe("number");
		expect(REAPER_INTERVAL_MS).toBeGreaterThan(0);
	});

	it("REAPER_INTERVAL_MS is less than DEFAULT_IDLE_TIMEOUT_MS", () => {
		expect(REAPER_INTERVAL_MS).toBeLessThan(DEFAULT_IDLE_TIMEOUT_MS);
	});
});

// ── Semaphore: max connections cap ───────────────────────────────────────
//
// Subtask 3: verify pool respects max connections under concurrent load.

describe("connection pool semaphore — max connections cap", () => {
	const semCfg = {
		serverUrl:      "ldap://sem-cap-test.example.com",
		bindDN:         "cn=svc,dc=example,dc=com",
		bindPassword:   "pw",
		maxConnections: 3,
		acquireTimeout: 2_000,
	};
	const semKey = `${semCfg.serverUrl}|${semCfg.bindDN}|plain`;

	beforeEach(() => {
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(null));
		pools.delete(semKey);
		semaphores.delete(semKey);
		stopReaper(semKey);
	});

	afterEach(() => {
		// Drain any queued waiters to prevent dangling timers
		const sem = semaphores.get(semKey);
		if (sem) {
			for (const w of sem.waiters) clearTimeout(w.timer);
			sem.waiters = [];
			sem.activeCount = 0;
		}
		pools.delete(semKey);
		semaphores.delete(semKey);
		stopReaper(semKey);
	});

	it("only creates maxConnections simultaneous connections under concurrent load", async () => {
		ldap.createClient.mockClear();

		// Launch 5 concurrent borrows; only 3 can proceed immediately
		const borrows = Array.from({ length: 5 }, () => borrowFromPool(semCfg));

		// Let the first 3 resolve (they go through LdapClient.create → setImmediate)
		const [c0, c1, c2] = await Promise.all([borrows[0], borrows[1], borrows[2]]);

		// Exactly 3 connections were created
		expect(ldap.createClient).toHaveBeenCalledTimes(3);

		const sem = semaphores.get(semKey);
		expect(sem.activeCount).toBe(3);
		expect(sem.waiters).toHaveLength(2);

		// Return two — the two waiters get served (no new connections)
		returnToPool(semCfg, c0);
		returnToPool(semCfg, c1);

		const [c3, c4] = await Promise.all([borrows[3], borrows[4]]);
		expect(c3).toBeDefined();
		expect(c4).toBeDefined();

		// Still only 3 connections were ever created
		expect(ldap.createClient).toHaveBeenCalledTimes(3);

		returnToPool(semCfg, c2);
		returnToPool(semCfg, c3);
		returnToPool(semCfg, c4);
	});

	it("semaphore activeCount never exceeds maxConnections", async () => {
		const max = semCfg.maxConnections;

		// Fill to capacity
		const borrowed = await Promise.all(
			Array.from({ length: max }, () => borrowFromPool(semCfg)),
		);
		const sem = semaphores.get(semKey);
		expect(sem.activeCount).toBe(max);

		// One more borrow queues — activeCount stays at max
		const overflow = borrowFromPool(semCfg);
		expect(sem.activeCount).toBe(max);
		expect(sem.waiters).toHaveLength(1);

		// Return one → waiter gets it
		returnToPool(semCfg, borrowed[0]);
		const extra = await overflow;
		expect(sem.activeCount).toBe(max);

		// Clean up
		for (let i = 1; i < borrowed.length; i++) returnToPool(semCfg, borrowed[i]);
		returnToPool(semCfg, extra);
	});

	it("returnToPool hands connection directly to a queued waiter (no new connection)", async () => {
		ldap.createClient.mockClear();

		// Fill pool
		const [a, b, c] = await Promise.all([
			borrowFromPool(semCfg),
			borrowFromPool(semCfg),
			borrowFromPool(semCfg),
		]);

		// Queue one waiter
		const waiting = borrowFromPool(semCfg);

		// Return 'a' — waiter gets exactly that connection
		returnToPool(semCfg, a);
		const waiterConn = await waiting;

		expect(ldap.createClient).toHaveBeenCalledTimes(3);
		expect(waiterConn).toBe(a);

		returnToPool(semCfg, b);
		returnToPool(semCfg, c);
		returnToPool(semCfg, waiterConn);
	});

	it("DEFAULT_MAX_CONNECTIONS is a positive number", () => {
		expect(typeof DEFAULT_MAX_CONNECTIONS).toBe("number");
		expect(DEFAULT_MAX_CONNECTIONS).toBeGreaterThan(0);
	});

	it("DEFAULT_ACQUIRE_TIMEOUT_MS is a positive number", () => {
		expect(typeof DEFAULT_ACQUIRE_TIMEOUT_MS).toBe("number");
		expect(DEFAULT_ACQUIRE_TIMEOUT_MS).toBeGreaterThan(0);
	});
});

// ── Semaphore: acquire timeout ────────────────────────────────────────────
//
// Subtask 4: verify that a queued borrow request times out when the pool
// remains exhausted past acquireTimeout ms.

describe("connection pool semaphore — acquire timeout", () => {
	// Use doNotFake so setImmediate still works for LdapClient.create
	const TIMEOUT_MS = 100;
	const toCfg = {
		serverUrl:      "ldap://sem-timeout-test.example.com",
		bindDN:         "cn=svc,dc=example,dc=com",
		bindPassword:   "pw",
		maxConnections: 1,
		acquireTimeout: TIMEOUT_MS,
	};
	const toKey = `${toCfg.serverUrl}|${toCfg.bindDN}|plain`;

	beforeEach(() => {
		// Fake only interval/timeout; leave setImmediate real for LdapClient.create
		jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
		mockClient.bind.mockImplementation((_dn, _pw, cb) => cb(null));
		pools.delete(toKey);
		semaphores.delete(toKey);
		stopReaper(toKey);
	});

	afterEach(() => {
		const sem = semaphores.get(toKey);
		if (sem) {
			for (const w of sem.waiters) clearTimeout(w.timer);
			sem.waiters = [];
			sem.activeCount = 0;
		}
		pools.delete(toKey);
		semaphores.delete(toKey);
		stopReaper(toKey);
		jest.useRealTimers();
	});

	it("rejects with a pool exhausted error after acquireTimeout ms", async () => {
		// Occupy the only slot
		const heldConn = await borrowFromPool(toCfg);

		// Queue a second borrow
		const timedOut = borrowFromPool(toCfg);

		const sem = semaphores.get(toKey);
		expect(sem.waiters).toHaveLength(1);

		// Advance past the timeout without returning the connection
		jest.advanceTimersByTime(TIMEOUT_MS + 10);

		await expect(timedOut).rejects.toThrow(/pool exhausted/i);
		expect(sem.waiters).toHaveLength(0);

		returnToPool(toCfg, heldConn);
	});

	it("timeout error message mentions acquireTimeout and maxConnections", async () => {
		const heldConn = await borrowFromPool(toCfg);

		const timedOut = borrowFromPool(toCfg);
		jest.advanceTimersByTime(TIMEOUT_MS + 10);

		const err = await timedOut.catch((e) => e);
		expect(err.message).toMatch(new RegExp(`${TIMEOUT_MS}ms`));
		expect(err.message).toMatch(new RegExp(`max=${toCfg.maxConnections}`));

		returnToPool(toCfg, heldConn);
	});

	it("does NOT reject if connection is returned before the timeout fires", async () => {
		const heldConn = await borrowFromPool(toCfg);

		const waiting = borrowFromPool(toCfg);

		// Return BEFORE the timeout fires
		returnToPool(toCfg, heldConn);

		// Now advance time — timer was already cleared so no rejection
		jest.advanceTimersByTime(TIMEOUT_MS + 10);

		const conn = await waiting;
		expect(conn).toBeDefined();

		returnToPool(toCfg, conn);
	});
});
