import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkUpstreams } = vi.hoisted(() => ({ checkUpstreams: vi.fn() }));
vi.mock("src/api/backend", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend")>()),
	checkUpstreams,
}));

import { resetUpstreamCheckCache, useUpstreamCheck } from "./useUpstreamCheck";

describe("useUpstreamCheck", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetUpstreamCheckCache();
		checkUpstreams.mockReset();
		checkUpstreams.mockResolvedValue({
			results: [{ host: "app", port: 80, ok: true, code: "ok", message: "" }],
		});
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("never checks a forward host that is an nginx variable", async () => {
		const { result } = renderHook(() => useUpstreamCheck({ host: "$backend", port: 80 }));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		expect(checkUpstreams).not.toHaveBeenCalled();
		expect(result.current).toEqual({ result: null, isChecking: false });
	});

	it("checks an ordinary host", async () => {
		const { result } = renderHook(() => useUpstreamCheck({ host: "app", port: 80 }));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		expect(checkUpstreams).toHaveBeenCalledTimes(1);
		expect(result.current.result?.code).toBe("ok");
	});
});
