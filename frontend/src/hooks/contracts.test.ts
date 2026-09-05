import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
	checkVersion: vi.fn(),
	createAccessList: vi.fn(),
	createDeadHost: vi.fn(),
	createProxyHost: vi.fn(),
	createRedirectionHost: vi.fn(),
	createStream: vi.fn(),
	createUpstream: vi.fn(),
	createUser: vi.fn(),
	getAccessList: vi.fn(),
	getAccessLists: vi.fn(),
	getAuditLog: vi.fn(),
	getAuditLogs: vi.fn(),
	getCertificate: vi.fn(),
	getCertificates: vi.fn(),
	getCertificateDNSProviders: vi.fn(),
	getDeadHost: vi.fn(),
	getDeadHosts: vi.fn(),
	getHealth: vi.fn(),
	getHostsReport: vi.fn(),
	getProxyHost: vi.fn(),
	getProxyHosts: vi.fn(),
	getRedirectionHost: vi.fn(),
	getRedirectionHosts: vi.fn(),
	getSetting: vi.fn(),
	getStream: vi.fn(),
	getStreams: vi.fn(),
	getUpstream: vi.fn(),
	getUpstreams: vi.fn(),
	getUser: vi.fn(),
	getUsers: vi.fn(),
	updateAccessList: vi.fn(),
	updateDeadHost: vi.fn(),
	updateProxyHost: vi.fn(),
	updateRedirectionHost: vi.fn(),
	updateSetting: vi.fn(),
	updateStream: vi.fn(),
	updateUpstream: vi.fn(),
	updateUser: vi.fn(),
}));

const client = vi.hoisted(() => ({
	getQueryData: vi.fn(() => ({ persisted: true })),
	setQueryData: vi.fn(),
	invalidateQueries: vi.fn(),
}));

vi.mock("src/api/backend", () => backend);
vi.mock("src/context", () => ({ Dark: "dark", Light: "light", useTheme: vi.fn(() => "theme") }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: vi.fn((config) => config),
	useMutation: vi.fn((config) => config),
	useQueryClient: vi.fn(() => client),
}));

import * as hooks from "./index";
import { useUpstream, useSetUpstream } from "./useUpstreams";

type QueryContract = { queryFn: () => Promise<unknown>; queryKey: unknown; staleTime: number };
type MutationContract = {
	mutationFn: (value: Record<string, unknown>) => Promise<unknown>;
	onMutate?: (value: Record<string, unknown>) => (() => void) | undefined;
	onError?: (error: unknown, value: unknown, rollback: () => void) => void;
	onSuccess: (value: Record<string, unknown>) => Promise<void> | void;
};

const query = (value: unknown) => value as QueryContract;
const mutation = (value: unknown) => value as MutationContract;

describe("data hooks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const fn of Object.values(backend)) fn.mockResolvedValue({ id: 7 });
	});

	it("builds list and status queries and delegates their fetchers", async () => {
		const contracts = [
			hooks.useAccessLists(["owner"]),
			hooks.useAuditLogs(["user"]),
			hooks.useCertificates(["owner"]),
			hooks.useDeadHosts(["owner"]),
			hooks.useDnsProviders(),
			hooks.useProxyHosts(["owner"]),
			hooks.useRedirectionHosts(["owner"]),
			hooks.useStreams(["owner"]),
			hooks.useUsers(["permissions"]),
			hooks.useCheckVersion(),
			hooks.useHealth(),
			hooks.useHostReport(),
			hooks.useUpstreams(),
		].map(query);

		for (const contract of contracts) await contract.queryFn();

		expect(backend.getAccessLists).toHaveBeenCalledWith(["owner"]);
		expect(backend.getAuditLogs).toHaveBeenCalledWith(["user"]);
		expect(backend.getCertificates).toHaveBeenCalledWith(["owner"]);
		expect(backend.getDeadHosts).toHaveBeenCalledWith(["owner"]);
		expect(backend.getCertificateDNSProviders).toHaveBeenCalledOnce();
		expect(backend.getProxyHosts).toHaveBeenCalledWith(["owner"]);
		expect(backend.getRedirectionHosts).toHaveBeenCalledWith(["owner"]);
		expect(backend.getStreams).toHaveBeenCalledWith(["owner"]);
		expect(backend.getUsers).toHaveBeenCalledWith(["permissions"]);
		expect(backend.checkVersion).toHaveBeenCalledOnce();
		expect(backend.getHealth).toHaveBeenCalledOnce();
		expect(backend.getHostsReport).toHaveBeenCalledOnce();
		expect(backend.getUpstreams).toHaveBeenCalledOnce();
	});

	it("builds singleton queries for new defaults and persisted records", async () => {
		const newContracts = [
			hooks.useAccessList("new"),
			hooks.useDeadHost("new"),
			hooks.useProxyHost("new"),
			hooks.useRedirectionHost("new"),
			hooks.useStream("new"),
			hooks.useUser("new"),
			useUpstream("new"),
		].map(query);
		const defaults = await Promise.all(newContracts.map((contract) => contract.queryFn()));
		expect(defaults.every((value) => (value as { id: number }).id === 0)).toBe(true);

		const existing = [
			hooks.useAccessList(7),
			hooks.useAuditLog(7),
			hooks.useCertificate(7),
			hooks.useDeadHost(7),
			hooks.useProxyHost(7),
			hooks.useRedirectionHost(7),
			hooks.useSetting("default-site"),
			hooks.useStream(7),
			hooks.useUser(7),
			useUpstream(7),
		].map(query);
		for (const contract of existing) await contract.queryFn();

		expect(backend.getAccessList).toHaveBeenCalledWith(7, ["owner"]);
		expect(backend.getAuditLog).toHaveBeenCalledWith(7, ["user"]);
		expect(backend.getCertificate).toHaveBeenCalledWith(7, ["owner"]);
		expect(backend.getDeadHost).toHaveBeenCalledWith(7, ["owner"]);
		expect(backend.getProxyHost).toHaveBeenCalledWith(7, ["owner"]);
		expect(backend.getRedirectionHost).toHaveBeenCalledWith(7, ["owner"]);
		expect(backend.getSetting).toHaveBeenCalledWith("default-site");
		expect(backend.getStream).toHaveBeenCalledWith(7, ["owner"]);
		expect(backend.getUser).toHaveBeenCalledWith(7, ["permissions"]);
		expect(backend.getUpstream).toHaveBeenCalledWith(7);
	});

	it("chooses create or update in mutation hooks", async () => {
		const contracts = [
			[hooks.useSetAccessList(), backend.createAccessList, backend.updateAccessList],
			[hooks.useSetDeadHost(), backend.createDeadHost, backend.updateDeadHost],
			[hooks.useSetProxyHost(), backend.createProxyHost, backend.updateProxyHost],
			[hooks.useSetRedirectionHost(), backend.createRedirectionHost, backend.updateRedirectionHost],
			[hooks.useSetStream(), backend.createStream, backend.updateStream],
			[hooks.useSetUser(), backend.createUser, backend.updateUser],
			[useSetUpstream(), backend.createUpstream, backend.updateUpstream],
		] as const;

		for (const [rawContract, create, update] of contracts) {
			const contract = mutation(rawContract);
			await contract.mutationFn({ id: 0, name: "new" });
			await contract.mutationFn({ id: 7, name: "saved" });
			expect(create).toHaveBeenCalled();
			expect(update).toHaveBeenCalled();
		}
		const setting = mutation(hooks.useSetSetting());
		await setting.mutationFn({ id: "default-site", value: "404" });
		expect(backend.updateSetting).toHaveBeenCalled();
	});

	it("performs optimistic updates, rollbacks and cache invalidation", async () => {
		const optimistic = [
			hooks.useSetAccessList(),
			hooks.useSetDeadHost(),
			hooks.useSetRedirectionHost(),
			hooks.useSetSetting(),
			hooks.useSetStream(),
			hooks.useSetUser(),
		].map(mutation);

		for (const contract of optimistic) {
			expect(contract.onMutate?.({ id: 0 })).toBeUndefined();
			const rollback = contract.onMutate?.({ id: 7, changed: true });
			expect(rollback).toBeTypeOf("function");
			rollback?.();
			const suppliedRollback = vi.fn();
			contract.onError?.(new Error("failed"), {}, suppliedRollback);
			expect(suppliedRollback).toHaveBeenCalledOnce();
			await contract.onSuccess({ id: 7 });
		}

		await mutation(hooks.useSetProxyHost()).onSuccess({ id: 7 });
		await mutation(useSetUpstream()).onSuccess({ id: 7 });
		expect(client.getQueryData).toHaveBeenCalled();
		expect(client.setQueryData).toHaveBeenCalled();
		expect(client.invalidateQueries.mock.calls.length).toBeGreaterThan(20);
	});

	it("exposes theme values through the wrapper", () => {
		expect(hooks.useTheme()).toBe("theme");
		expect(hooks.Dark).toBe("dark");
		expect(hooks.Light).toBe("light");
	});
});
