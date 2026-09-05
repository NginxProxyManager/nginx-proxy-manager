import { beforeEach, describe, expect, it, vi } from "vitest";
import { tableEventReducer, tableEvents } from "src/components/Table/TableHelpers";
import { buildFilters, tableFiltersToAPI, tableSortToAPI } from "src/api/backend/helpers";
import AuthStore, { AuthStore as AuthStoreClass, TOKEN_KEY } from "./AuthStore";
import { hasPermission, isAdmin, MANAGE, PROXY_HOSTS, VIEW } from "./Permissions";
import { validateDomain, validateDomains, validateEmail, validateNumber, validateString } from "./Validations";

describe("AuthStore", () => {
	beforeEach(() => localStorage.clear());

	it("manages the token stack and tolerates corrupt storage", () => {
		const store = new AuthStoreClass();
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		localStorage.setItem(TOKEN_KEY, "not-json");
		expect(store.tokens).toEqual([]);
		expect(error).toHaveBeenCalled();

		store.set({ token: "one", expires: 123 });
		store.add({ token: "two", expires: 456 });
		expect(store.count()).toBe(2);
		expect(store.token).toEqual({ token: "two", expires: 456 });
		expect(store.expires).toBe(456);
		store.drop();
		expect(store.count()).toBe(1);
		store.clear();
		expect(store.token).toBeNull();
	});

	it("removes expired tokens and accepts a valid ISO expiry", () => {
		const store = new AuthStoreClass();
		store.add({ token: "expired", expires: 1 });
		store.add({ token: "valid", expires: "2999-01-01T00:00:00Z" } as never);
		expect(store.hasActiveToken()).toBe(true);
		store.drop();
		expect(store.hasActiveToken()).toBe(false);
	});

	it("exposes a null expiry for absent or invalid data", () => {
		expect(AuthStore.expires).toBeNull();
		localStorage.setItem(TOKEN_KEY, JSON.stringify([{ token: "x", expires: "invalid" }]));
		expect(AuthStore.expires).toBeNull();
	});
});

describe("table and API helpers", () => {
	it("converts sorting, filtering, and sparse filter values", () => {
		expect(tableSortToAPI(undefined)).toBeUndefined();
		expect(tableSortToAPI([{ id: "createdOn", desc: true }, { id: "name", desc: false }])).toBe(
			"created_on.desc,name.asc",
		);
		expect(tableFiltersToAPI([])).toEqual({});
		expect(tableFiltersToAPI([{ id: "domainNames", value: { modifier: "contains", value: "example" } }])).toEqual({
			"domain_names:contains": "example",
		});
		expect(buildFilters()).toBeUndefined();
		expect(buildFilters({ a: "", b: null, c: undefined, enabled: false, count: "0" })).toEqual({
			enabled: "false",
			count: "0",
		});
	});

	it("reduces every supported table event and rejects unknown events", () => {
		const initial = { offset: 20, limit: 10, total: 30, sortBy: [], filters: [] };
		expect(tableEventReducer(initial, { type: tableEvents.PAGE_CHANGED, payload: 3 }).offset).toBe(30);
		expect(tableEventReducer(initial, { type: tableEvents.PAGE_SIZE_CHANGED, payload: 50 }).limit).toBe(50);
		expect(tableEventReducer(initial, { type: tableEvents.TOTAL_COUNT_CHANGED, payload: 99 }).total).toBe(99);
		expect(tableEventReducer(initial, { type: tableEvents.SORT_CHANGED, payload: ["name"] }).sortBy).toEqual(["name"]);
		expect(tableEventReducer(initial, { type: tableEvents.FILTERS_CHANGED, payload: initial.filters }).offset).toBe(20);
		expect(tableEventReducer(initial, { type: tableEvents.FILTERS_CHANGED, payload: [] }).offset).toBe(0);
		expect(() => tableEventReducer(initial, { type: "UNKNOWN" })).toThrow("Unhandled action type");
	});
});

describe("permissions and validation", () => {
	it("handles administrators and section permissions", () => {
		expect(isAdmin(["admin"])).toBe(true);
		expect(isAdmin(undefined)).toBe(false);
		expect(hasPermission(PROXY_HOSTS, VIEW, undefined, [])).toBe(false);
		expect(hasPermission(PROXY_HOSTS, VIEW, { proxyHosts: MANAGE } as never, [])).toBe(true);
		expect(hasPermission(PROXY_HOSTS, MANAGE, { proxyHosts: VIEW } as never, [])).toBe(false);
		expect(hasPermission(PROXY_HOSTS, VIEW, {} as never, ["admin"])).toBe(true);
	});

	it("validates strings, numbers, email addresses, and domains", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		error.mockClear();
		validateString();
		validateNumber();
		expect(error).toHaveBeenCalledTimes(2);
		expect(validateString(2, 4)("")).toBeTruthy();
		expect(validateString(2, 4)("a")).toBeTruthy();
		expect(validateString(2, 4)("abcde")).toBeTruthy();
		expect(validateString(2, 4)("abc")).toBeUndefined();
		expect(validateNumber(2, 4)("0")).toBeTruthy();
		expect(validateNumber(2, 4)("1")).toBeTruthy();
		expect(validateNumber(2, 4)("5")).toBeTruthy();
		expect(validateNumber(2, 4)("3")).toBeUndefined();
		expect(validateEmail()("")).toBeTruthy();
		expect(validateEmail()("bad")).toBeTruthy();
		expect(validateEmail()("a@example.com")).toBeUndefined();
		expect(validateDomain()("ab")).toBe(false);
		expect(validateDomain()("*.example.com")).toBe(false);
		expect(validateDomain(true)("*.*.example.com")).toBe(false);
		expect(validateDomain(true)("bad@example.com")).toBe(false);
		expect(validateDomain(true)("*.com")).toBe(false);
		expect(validateDomain(true)("*.example.com")).toBe(true);
		expect(validateDomains()(undefined)).toBeTruthy();
		expect(validateDomains(false, 2)(["a.example", "b.example"])).toBeTruthy();
		expect(validateDomains()(["bad!"])).toBeTruthy();
		expect(validateDomains()(["a.example"])).toBeUndefined();
	});
});
