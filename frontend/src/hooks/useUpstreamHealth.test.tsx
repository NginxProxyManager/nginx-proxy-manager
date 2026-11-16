import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUpstreamHealth } = vi.hoisted(() => ({ getUpstreamHealth: vi.fn() }));
vi.mock("src/api/backend", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/api/backend")>()),
	getUpstreamHealth,
}));

import { ApiError } from "src/api/backend/base";
import { useUpstreamHealth } from "./useUpstreamHealth";

const wrapper = () => {
	const client = new QueryClient();
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
};

const advance = async (ms: number) => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
};

describe("useUpstreamHealth", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		getUpstreamHealth.mockReset();
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	for (const status of [403, 404]) {
		it(`stops polling after a ${status}`, async () => {
			getUpstreamHealth.mockRejectedValue(new ApiError("nope", { status }));
			const Wrapper = wrapper();
			const { result } = renderHook(() => useUpstreamHealth(), { wrapper: Wrapper });
			await advance(10);
			expect(result.current.data).toBeNull();
			expect(getUpstreamHealth).toHaveBeenCalledTimes(1);
			await advance(5 * 60 * 1000);
			expect(getUpstreamHealth).toHaveBeenCalledTimes(1);
			// another component using the hook doesn't ask again either
			renderHook(() => useUpstreamHealth(), { wrapper: Wrapper });
			await advance(10);
			expect(getUpstreamHealth).toHaveBeenCalledTimes(1);
		});
	}

	it("keeps polling every 30s while health is available", async () => {
		getUpstreamHealth.mockResolvedValue({ hosts: {} });
		renderHook(() => useUpstreamHealth(), { wrapper: wrapper() });
		await advance(10);
		expect(getUpstreamHealth).toHaveBeenCalledTimes(1);
		await advance(30 * 1000);
		expect(getUpstreamHealth).toHaveBeenCalledTimes(2);
		await advance(30 * 1000);
		expect(getUpstreamHealth).toHaveBeenCalledTimes(3);
	});
});
