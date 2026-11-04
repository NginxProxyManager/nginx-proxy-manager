import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { testHostConfig } = vi.hoisted(() => ({ testHostConfig: vi.fn() }));
vi.mock("src/api/backend", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend")>()),
	testHostConfig,
}));

import { formValuesKey, useHostConfigTest } from "./useHostConfigTest";

const okResult = {
	ok: true,
	nginxOnline: true,
	nginxErr: null,
	nginxDetails: null,
	nginxLocations: [],
	upstreams: [],
	warnings: [],
};

const form = (values: any, errors: Record<string, any> = {}) => ({
	values,
	validateForm: vi.fn().mockResolvedValue(errors),
	setTouched: vi.fn(),
});

describe("useHostConfigTest", () => {
	beforeEach(() => {
		testHostConfig.mockReset();
		testHostConfig.mockResolvedValue(okResult);
	});
	afterEach(() => cleanup());

	it("tests the payload and remembers which values were tested", async () => {
		const { result } = renderHook(() => useHostConfigTest("proxy-hosts"));
		const values = { domainNames: ["a.example.com"] };
		let returned: unknown;
		await act(async () => {
			returned = await result.current.runTest(form(values), { id: 3, ...values });
		});
		expect(testHostConfig).toHaveBeenCalledWith("proxy-hosts", { id: 3, ...values }, expect.any(AbortController));
		expect(returned).toEqual(okResult);
		expect(result.current.result).toEqual(okResult);
		expect(result.current.error).toBeNull();
		expect(result.current.isTesting).toBe(false);
		expect(result.current.testedKey).toBe(formValuesKey(values));
	});

	it("doesn't call the backend when the form is invalid", async () => {
		const { result } = renderHook(() => useHostConfigTest("streams"));
		const onInvalid = vi.fn();
		const f = form({}, { forwardingHost: "required" });
		await act(async () => {
			await result.current.runTest(f, {}, onInvalid);
		});
		expect(testHostConfig).not.toHaveBeenCalled();
		expect(f.setTouched).toHaveBeenCalledWith({ forwardingHost: true }, false);
		expect(onInvalid).toHaveBeenCalledWith({ forwardingHost: "required" });
		expect(result.current.result).toBeNull();
	});

	it("keeps a failed request as error", async () => {
		const err = new Error("test.example.com is already in use");
		testHostConfig.mockRejectedValue(err);
		const { result } = renderHook(() => useHostConfigTest("dead-hosts"));
		await act(async () => {
			await result.current.runTest(form({}), {});
		});
		expect(result.current.error).toBe(err);
		expect(result.current.result).toBeNull();
	});

	it("ignores a test that was replaced by a newer one, and reset clears the result", async () => {
		let resolveFirst: (v: any) => void = () => {};
		testHostConfig.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
		testHostConfig.mockResolvedValueOnce({ ...okResult, warnings: [{ code: "x", message: "second" }] });
		const { result } = renderHook(() => useHostConfigTest("proxy-hosts"));

		let first: Promise<unknown> = Promise.resolve();
		await act(async () => {
			first = result.current.runTest(form({ a: 1 }), {});
			await Promise.resolve();
		});
		await act(async () => {
			await result.current.runTest(form({ a: 2 }), {});
		});
		await act(async () => {
			resolveFirst({ ...okResult, ok: false });
			await first;
		});
		expect(result.current.result?.warnings[0]?.message).toBe("second");
		expect(result.current.testedKey).toBe(formValuesKey({ a: 2 }));

		act(() => result.current.reset());
		expect(result.current.result).toBeNull();
		expect(result.current.testedKey).toBeNull();
	});
});
